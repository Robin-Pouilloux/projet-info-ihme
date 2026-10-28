import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const numericColumns = {
  bikes: ["current_odometer_km"],
  components: ["installed_km", "maintenance_interval_km"],
  bike_rides: ["distance_km"],
  maintenance_records: ["bike_km", "cost_eur"],
  shoe_runs: ["distance_km", "road_km", "trail_km"],
};

const definitions = {
  bike: {
    name: { type: "string", required: true, min: 1, max: 100 },
    brand: { type: "string", max: 80, nullable: true },
    model: { type: "string", max: 100, nullable: true },
    serial_number: { type: "string", max: 100, nullable: true },
    purchase_date: { type: "date", nullable: true },
    current_odometer_km: { type: "number", min: 0 },
  },
  component: {
    name: { type: "string", required: true, min: 1, max: 100 },
    category: { type: "string", max: 60, nullable: true },
    installed_km: { type: "number", min: 0 },
    maintenance_interval_km: { type: "number", min: 0, exclusiveMin: true, nullable: true },
  },
  bikeRide: {
    occurred_on: { type: "date", required: true },
    distance_km: { type: "number", required: true, min: 0, exclusiveMin: true, max: 1000 },
    duration_minutes: { type: "integer", required: true, min: 0, exclusiveMin: true, max: 1440 },
    elevation_m: { type: "integer", min: 0, max: 20000 },
    ride_type: { type: "string", min: 1, max: 40 },
    notes: { type: "string", nullable: true },
  },
  maintenance: {
    bike_id: { type: "integer", required: true, min: 1 },
    component_id: { type: "integer", min: 1, nullable: true },
    operation: { type: "string", required: true, min: 1, max: 160 },
    performed_on: { type: "date", required: true },
    bike_km: { type: "number", required: true, min: 0 },
    cost_eur: { type: "number", min: 0, nullable: true },
    notes: { type: "string", nullable: true },
  },
  shoe: {
    name: { type: "string", required: true, min: 1, max: 100 },
    brand: { type: "string", max: 80, nullable: true },
    model: { type: "string", max: 100, nullable: true },
    shoe_type: { type: "string", min: 1, max: 30 },
    purchase_date: { type: "date", nullable: true },
    notes: { type: "string", nullable: true },
  },
  shoeRun: {
    occurred_on: { type: "date", required: true },
    distance_km: { type: "number", required: true, min: 0, exclusiveMin: true, max: 500 },
    duration_minutes: { type: "integer", required: true, min: 0, exclusiveMin: true, max: 1440 },
    elevation_m: { type: "integer", min: 0, max: 20000 },
    steps: { type: "integer", min: 0, exclusiveMin: true, nullable: true },
    road_km: { type: "number", min: 0 },
    trail_km: { type: "number", min: 0 },
    notes: { type: "string", nullable: true },
  },
  shoeAssessment: {
    assessed_on: { type: "date", required: true },
    sole_score: { type: "integer", required: true, min: 1, max: 5 },
    grip_score: { type: "integer", required: true, min: 1, max: 5 },
    cushion_score: { type: "integer", required: true, min: 1, max: 5 },
    comfort_score: { type: "integer", required: true, min: 1, max: 5 },
    notes: { type: "string", nullable: true },
  },
};

const defaults = {
  bike: { current_odometer_km: 0 },
  component: { installed_km: 0 },
  bikeRide: { elevation_m: 0, ride_type: "route" },
  maintenance: {},
  shoe: { shoe_type: "running" },
  shoeRun: { elevation_m: 0, steps: null, road_km: 0, trail_km: 0 },
  shoeAssessment: { notes: null },
};

class RequestValidationError extends Error {
  constructor(details) {
    super("Validation error");
    this.details = details;
  }
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validationError(field, message, type) {
  return {
    loc: ["body", field],
    msg: message,
    type,
  };
}

function parsePayload(kind, body, { partial = false } = {}) {
  const definition = definitions[kind];
  const payload = {};
  const errors = [];
  if (!partial) Object.assign(payload, defaults[kind]);
  const keys = partial ? Object.keys(body) : Object.keys(definition);

  for (const field of keys) {
    const rule = definition[field];
    if (!rule) continue;
    const value = body[field];
    if (value === undefined) {
      if (!partial && rule.required) errors.push(validationError(field, "Field required", "missing"));
      continue;
    }
    if (value === null) {
      if (rule.nullable) payload[field] = null;
      else if (partial) {
        errors.push(validationError(field, "Input should be a valid value", "value_error"));
      } else if (rule.required) {
        errors.push(validationError(field, "Input should be a valid value", "value_error"));
      }
      continue;
    }

    let parsed = value;
    if (rule.type === "number" || rule.type === "integer") {
      if (typeof value !== "number" && typeof value !== "string") {
        errors.push(validationError(field, "Input should be a valid number", `${rule.type === "integer" ? "int" : "float"}_parsing`));
        continue;
      }
      if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
        errors.push(validationError(field, "Input should be a valid number", `${rule.type === "integer" ? "int" : "float"}_parsing`));
        continue;
      }
      parsed = Number(value);
      if (!Number.isFinite(parsed) || (rule.type === "integer" && !Number.isInteger(parsed))) {
        errors.push(validationError(field, "Input should be a valid number", `${rule.type === "integer" ? "int" : "float"}_parsing`));
        continue;
      }
    } else if (rule.type === "date") {
      if (!isValidDate(value)) {
        errors.push(validationError(field, "Input should be a valid date", "date_from_datetime_parsing"));
        continue;
      }
    } else if (typeof value !== "string") {
      errors.push(validationError(field, "Input should be a valid string", "string_type"));
      continue;
    }

    if ((rule.type === "number" || rule.type === "integer") && rule.min !== undefined && parsed < rule.min) {
      const exclusive = rule.exclusiveMin;
      errors.push(validationError(
        field,
        exclusive ? `Input should be greater than ${rule.min}` : `Input should be greater than or equal to ${rule.min}`,
        exclusive ? "greater_than" : "greater_than_equal",
      ));
      continue;
    }
    if ((rule.type === "number" || rule.type === "integer") && rule.max !== undefined && parsed > rule.max) {
      errors.push(validationError(
        field,
        `Input should be less than or equal to ${rule.max}`,
        "less_than_equal",
      ));
      continue;
    }
    if (typeof parsed === "string" && rule.min !== undefined && parsed.length < rule.min) {
      errors.push(validationError(field, `String should have at least ${rule.min} characters`, "string_too_short"));
      continue;
    }
    if (typeof parsed === "string" && rule.max !== undefined && parsed.length > rule.max) {
      errors.push(validationError(field, `String should have at most ${rule.max} characters`, "string_too_long"));
      continue;
    }
    payload[field] = parsed;
  }

  if (kind === "shoeRun" && !errors.length && Math.abs(payload.road_km + payload.trail_km - payload.distance_km) > 0.02) {
    errors.push(validationError("trail_km", "La somme route + trail doit correspondre à la distance (± 0,02 km).", "value_error"));
  }
  if (errors.length) throw new RequestValidationError(errors);
  return payload;
}

function serialize(row, table) {
  if (!row) return row;
  const result = { ...row };
  for (const column of numericColumns[table] ?? []) {
    if (result[column] !== null && result[column] !== undefined) result[column] = Number(result[column]);
  }
  return result;
}

function createOpenApiDocument() {
  const paths = {
    "/api/health": { get: { summary: "Health check" } },
    "/api/dashboard": { get: { summary: "Tableau de bord" } },
    "/api/bikes": { get: { summary: "Lister les vélos" }, post: { summary: "Créer un vélo" } },
    "/api/bikes/{bike_id}": { patch: { summary: "Modifier un vélo" }, delete: { summary: "Supprimer un vélo" } },
    "/api/bikes/{bike_id}/components": { get: { summary: "Lister les composants" }, post: { summary: "Créer un composant" } },
    "/api/components/{component_id}": { patch: { summary: "Modifier un composant" }, delete: { summary: "Supprimer un composant" } },
    "/api/bikes/{bike_id}/rides": { get: { summary: "Lister les sorties vélo" }, post: { summary: "Créer une sortie vélo" } },
    "/api/maintenance": { get: { summary: "Lister les entretiens" }, post: { summary: "Créer un entretien" } },
    "/api/shoes": { get: { summary: "Lister les chaussures" }, post: { summary: "Créer une paire" } },
    "/api/shoes/{shoe_id}": { patch: { summary: "Modifier une paire" }, delete: { summary: "Supprimer une paire" } },
    "/api/shoes/{shoe_id}/runs": { get: { summary: "Lister les sorties running" }, post: { summary: "Créer une sortie running" } },
    "/api/shoes/{shoe_id}/assessments": { get: { summary: "Lister les évaluations" }, post: { summary: "Créer une évaluation" } },
    "/api/shoes/{shoe_id}/stats": { get: { summary: "Statistiques d'usure" } },
  };
  return {
    openapi: "3.0.3",
    info: { title: "GearTrack API", version: "1.0.0" },
    paths,
  };
}

export function createApp({ pool, wearTrailFactor = 1.25, wearElevationFactorPer100m = 0.03, basePath = "/" }) {
  if (!pool) throw new TypeError("A PostgreSQL pool is required.");
  const app = express();
  const normalizedBasePath = `/${basePath.split("/").filter(Boolean).join("/")}/`.replace(/^\/\/$/, "/");
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const id = (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new RequestValidationError([
      { loc: ["path"], msg: "Input should be a valid integer", type: "int_parsing" },
    ]);
    return parsed;
  };
  const requireEntity = async (table, entityId, res) => {
    const result = await pool.query(`SELECT id FROM ${table} WHERE id = $1`, [entityId]);
    if (result.rowCount === 0) {
      res.status(404).json({ detail: "Élément introuvable." });
      return false;
    }
    return true;
  };
  const insert = async (res, table, columns, values, returningTable) => {
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    res.status(201).json(serialize(result.rows[0], returningTable));
  };
  const update = async (res, table, entityId, payload, requiredFields, returningTable) => {
    for (const field of requiredFields) {
      if (Object.hasOwn(payload, field) && payload[field] === null) {
        throw new RequestValidationError([
          validationError(field, "Input should be a valid value", "value_error"),
        ]);
      }
    }
    const entries = Object.entries(payload);
    if (!entries.length) {
      const existing = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [entityId]);
      if (existing.rowCount === 0) {
        res.status(404).json({ detail: "Élément introuvable." });
        return;
      }
      res.json(serialize(existing.rows[0], returningTable));
      return;
    }
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(", ");
    const result = await pool.query(
      `UPDATE ${table} SET ${assignments} WHERE id = $${entries.length + 1} RETURNING *`,
      [...entries.map(([, value]) => value), entityId],
    );
    if (!result.rowCount) {
      res.status(404).json({ detail: "Élément introuvable." });
      return;
    }
    res.json(serialize(result.rows[0], returningTable));
  };
  const remove = async (res, table, entityId) => {
    const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [entityId]);
    if (!result.rowCount) {
      res.status(404).json({ detail: "Élément introuvable." });
      return;
    }
    res.status(204).end();
  };

  app.get("/api/health", asyncRoute(async (_req, res) => {
    try {
      await pool.query("SELECT 1");
    } catch {
      res.status(503).json({ detail: { status: "unavailable" } });
      return;
    }
    res.json({ status: "ok" });
  }));
  app.get("/api/dashboard", asyncRoute(async (_req, res) => {
    const [bikeKm, shoeKm, bikeCount, shoeCount, rideCount, runCount, components, rides, maintenance] =
      await Promise.all([
        pool.query("SELECT COALESCE(SUM(distance_km), 0) AS total FROM bike_rides"),
        pool.query("SELECT COALESCE(SUM(distance_km), 0) AS total FROM shoe_runs"),
        pool.query("SELECT COUNT(*) AS count FROM bikes"),
        pool.query("SELECT COUNT(*) AS count FROM shoes"),
        pool.query("SELECT COUNT(*) AS count FROM bike_rides"),
        pool.query("SELECT COUNT(*) AS count FROM shoe_runs"),
        pool.query(`
          SELECT c.id AS component_id, c.name AS component, c.bike_id, b.name AS bike,
                 c.installed_km, c.maintenance_interval_km, b.current_odometer_km
          FROM components c JOIN bikes b ON b.id = c.bike_id
          WHERE c.maintenance_interval_km IS NOT NULL
        `),
        pool.query("SELECT bike_id, COALESCE(SUM(distance_km), 0) AS total FROM bike_rides GROUP BY bike_id"),
        pool.query(`
          SELECT component_id, bike_km, performed_on
          FROM maintenance_records WHERE component_id IS NOT NULL
          ORDER BY bike_km DESC, performed_on DESC, id DESC
        `),
      ]);

    const riddenByBike = new Map(rides.rows.map((row) => [row.bike_id, Number(row.total)]));
    const lastMaintenance = new Map();
    for (const record of maintenance.rows) {
      if (!lastMaintenance.has(record.component_id)) lastMaintenance.set(record.component_id, Number(record.bike_km));
    }
    const due = components.rows.map((component) => {
      const dueAt = (lastMaintenance.get(component.component_id) ?? Number(component.installed_km))
        + Number(component.maintenance_interval_km);
      const current = Number(component.current_odometer_km) + (riddenByBike.get(component.bike_id) ?? 0);
      return {
        component_id: component.component_id,
        component: component.component,
        bike_id: component.bike_id,
        bike: component.bike,
        due_at_km: dueAt,
        current_km: current,
        overdue: current >= dueAt,
      };
    }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due_at_km - a.current_km) - (b.due_at_km - b.current_km));
    const recent = [];
    for (const result of [
      await pool.query(`
        SELECT r.occurred_on AS date, 'Vélo' AS kind, b.name AS label,
               r.distance_km, r.id
        FROM bike_rides r JOIN bikes b ON b.id = r.bike_id
        ORDER BY r.occurred_on DESC, r.id DESC LIMIT 8
      `),
      await pool.query(`
        SELECT r.occurred_on AS date, 'Course' AS kind, s.name AS label,
               r.distance_km, r.id
        FROM shoe_runs r JOIN shoes s ON s.id = r.shoe_id
        ORDER BY r.occurred_on DESC, r.id DESC LIMIT 8
      `),
      await pool.query(`
        SELECT m.performed_on AS date, 'Entretien' AS kind, b.name AS label,
               m.operation AS detail, m.id
        FROM maintenance_records m JOIN bikes b ON b.id = m.bike_id
        ORDER BY m.performed_on DESC, m.id DESC LIMIT 8
      `),
    ]) {
      for (const row of result.rows) {
        recent.push({
          date: row.date,
          kind: row.kind,
          label: row.label,
          detail: row.detail ?? `${Number(row.distance_km)} km`,
          id: row.id,
        });
      }
    }
    recent.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
    res.json({
      bike_count: Number(bikeCount.rows[0].count),
      shoe_count: Number(shoeCount.rows[0].count),
      total_km: Number(bikeKm.rows[0].total) + Number(shoeKm.rows[0].total),
      bike_km: Number(bikeKm.rows[0].total),
      running_km: Number(shoeKm.rows[0].total),
      activity_count: Number(rideCount.rows[0].count) + Number(runCount.rows[0].count),
      upcoming_maintenance: due.slice(0, 8),
      recent_activities: recent.slice(0, 8).map(({ id: _id, ...activity }) => activity),
    });
  }));

  app.get("/api/bikes", asyncRoute(async (_req, res) => {
    const result = await pool.query("SELECT * FROM bikes ORDER BY name");
    res.json(result.rows.map((row) => serialize(row, "bikes")));
  }));
  app.post("/api/bikes", asyncRoute(async (req, res) => {
    const data = parsePayload("bike", req.body);
    data.created_at = new Date();
    await insert(res, "bikes", Object.keys(data), Object.values(data), "bikes");
  }));
  app.patch("/api/bikes/:bike_id", asyncRoute(async (req, res) => {
    const bikeId = id(req.params.bike_id);
    const data = parsePayload("bike", req.body, { partial: true });
    await update(res, "bikes", bikeId, data, ["name"], "bikes");
  }));
  app.delete("/api/bikes/:bike_id", asyncRoute(async (req, res) => {
    await remove(res, "bikes", id(req.params.bike_id));
  }));

  app.get("/api/bikes/:bike_id/components", asyncRoute(async (req, res) => {
    const bikeId = id(req.params.bike_id);
    if (!await requireEntity("bikes", bikeId, res)) return;
    const result = await pool.query("SELECT * FROM components WHERE bike_id = $1 ORDER BY name", [bikeId]);
    res.json(result.rows.map((row) => serialize(row, "components")));
  }));
  app.post("/api/bikes/:bike_id/components", asyncRoute(async (req, res) => {
    const bikeId = id(req.params.bike_id);
    if (!await requireEntity("bikes", bikeId, res)) return;
    const data = parsePayload("component", req.body);
    data.bike_id = bikeId;
    await insert(res, "components", Object.keys(data), Object.values(data), "components");
  }));
  app.patch("/api/components/:component_id", asyncRoute(async (req, res) => {
    const data = parsePayload("component", req.body, { partial: true });
    await update(res, "components", id(req.params.component_id), data, ["name", "installed_km"], "components");
  }));
  app.delete("/api/components/:component_id", asyncRoute(async (req, res) => {
    await remove(res, "components", id(req.params.component_id));
  }));

  app.get("/api/bikes/:bike_id/rides", asyncRoute(async (req, res) => {
    const bikeId = id(req.params.bike_id);
    if (!await requireEntity("bikes", bikeId, res)) return;
    const result = await pool.query("SELECT * FROM bike_rides WHERE bike_id = $1 ORDER BY occurred_on DESC", [bikeId]);
    res.json(result.rows.map((row) => serialize(row, "bike_rides")));
  }));
  app.post("/api/bikes/:bike_id/rides", asyncRoute(async (req, res) => {
    const bikeId = id(req.params.bike_id);
    if (!await requireEntity("bikes", bikeId, res)) return;
    const data = parsePayload("bikeRide", req.body);
    data.bike_id = bikeId;
    await insert(res, "bike_rides", Object.keys(data), Object.values(data), "bike_rides");
  }));

  app.get("/api/maintenance", asyncRoute(async (_req, res) => {
    const result = await pool.query("SELECT * FROM maintenance_records ORDER BY performed_on DESC");
    res.json(result.rows.map((row) => serialize(row, "maintenance_records")));
  }));
  app.post("/api/maintenance", asyncRoute(async (req, res) => {
    const data = parsePayload("maintenance", req.body);
    if (!await requireEntity("bikes", data.bike_id, res)) return;
    if (data.component_id !== null && data.component_id !== undefined) {
      const result = await pool.query("SELECT bike_id FROM components WHERE id = $1", [data.component_id]);
      if (result.rowCount === 0) {
        res.status(404).json({ detail: "Élément introuvable." });
        return;
      }
      if (result.rows[0].bike_id !== data.bike_id) {
        res.status(400).json({ detail: "Le composant ne correspond pas au vélo sélectionné." });
        return;
      }
    }
    await insert(res, "maintenance_records", Object.keys(data), Object.values(data), "maintenance_records");
  }));

  app.get("/api/shoes", asyncRoute(async (_req, res) => {
    const result = await pool.query("SELECT * FROM shoes ORDER BY name");
    res.json(result.rows);
  }));
  app.post("/api/shoes", asyncRoute(async (req, res) => {
    const data = parsePayload("shoe", req.body);
    await insert(res, "shoes", Object.keys(data), Object.values(data), "shoes");
  }));
  app.patch("/api/shoes/:shoe_id", asyncRoute(async (req, res) => {
    const data = parsePayload("shoe", req.body, { partial: true });
    await update(res, "shoes", id(req.params.shoe_id), data, ["name", "shoe_type"], "shoes");
  }));
  app.delete("/api/shoes/:shoe_id", asyncRoute(async (req, res) => {
    await remove(res, "shoes", id(req.params.shoe_id));
  }));

  app.get("/api/shoes/:shoe_id/runs", asyncRoute(async (req, res) => {
    const shoeId = id(req.params.shoe_id);
    if (!await requireEntity("shoes", shoeId, res)) return;
    const result = await pool.query("SELECT * FROM shoe_runs WHERE shoe_id = $1 ORDER BY occurred_on DESC", [shoeId]);
    res.json(result.rows.map((row) => serialize(row, "shoe_runs")));
  }));
  app.post("/api/shoes/:shoe_id/runs", asyncRoute(async (req, res) => {
    const shoeId = id(req.params.shoe_id);
    if (!await requireEntity("shoes", shoeId, res)) return;
    const data = parsePayload("shoeRun", req.body);
    data.shoe_id = shoeId;
    await insert(res, "shoe_runs", Object.keys(data), Object.values(data), "shoe_runs");
  }));
  app.get("/api/shoes/:shoe_id/assessments", asyncRoute(async (req, res) => {
    const shoeId = id(req.params.shoe_id);
    if (!await requireEntity("shoes", shoeId, res)) return;
    const result = await pool.query(
      "SELECT * FROM shoe_assessments WHERE shoe_id = $1 ORDER BY assessed_on DESC",
      [shoeId],
    );
    res.json(result.rows);
  }));
  app.post("/api/shoes/:shoe_id/assessments", asyncRoute(async (req, res) => {
    const shoeId = id(req.params.shoe_id);
    if (!await requireEntity("shoes", shoeId, res)) return;
    const data = parsePayload("shoeAssessment", req.body);
    data.shoe_id = shoeId;
    await insert(res, "shoe_assessments", Object.keys(data), Object.values(data), "shoe_assessments");
  }));
  app.get("/api/shoes/:shoe_id/stats", asyncRoute(async (req, res) => {
    const shoeId = id(req.params.shoe_id);
    if (!await requireEntity("shoes", shoeId, res)) return;
    const result = await pool.query("SELECT * FROM shoe_runs WHERE shoe_id = $1", [shoeId]);
    const runs = result.rows;
    const actualKm = runs.reduce((sum, run) => sum + Number(run.distance_km), 0);
    const roadKm = runs.reduce((sum, run) => sum + Number(run.road_km), 0);
    const trailKm = runs.reduce((sum, run) => sum + Number(run.trail_km), 0);
    const estimatedWearKm = runs.reduce((sum, run) => {
      const distance = Number(run.distance_km);
      const trailRatio = Number(run.trail_km) / distance;
      const terrainMultiplier = 1 + trailRatio * (wearTrailFactor - 1);
      const elevationMultiplier = 1 + (Number(run.elevation_m) / distance) / 100 * wearElevationFactorPer100m;
      return sum + distance * terrainMultiplier * elevationMultiplier;
    }, 0);
    const totalSurface = roadKm + trailKm;
    res.json({
      shoe_id: shoeId,
      actual_km: actualKm,
      estimated_wear_km: Math.round(estimatedWearKm * 100) / 100,
      run_count: runs.length,
      average_duration_minutes: runs.length
        ? runs.reduce((sum, run) => sum + run.duration_minutes, 0) / runs.length
        : 0,
      total_elevation_m: runs.reduce((sum, run) => sum + run.elevation_m, 0),
      road_percent: totalSurface ? roadKm / totalSurface * 100 : 0,
      trail_percent: totalSurface ? trailKm / totalSurface * 100 : 0,
      wear_factors: {
        base_km: 1,
        trail_factor: wearTrailFactor,
        elevation_factor_per_100m_per_km: wearElevationFactorPer100m,
      },
    });
  }));

  app.get("/openapi.json", (_req, res) => res.json(createOpenApiDocument()));
  app.get("/docs", (_req, res) => {
    res.type("html").send("<!doctype html><html lang='fr'><meta charset='utf-8'><title>GearTrack API</title><body><h1>GearTrack API</h1><p><a href='/openapi.json'>Spécification OpenAPI</a></p></body></html>");
  });

  const frontendDirectory = fileURLToPath(new URL("./app/static/", import.meta.url));
  if (existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory, { index: false }));
    if (normalizedBasePath !== "/") app.use(normalizedBasePath, express.static(frontendDirectory, { index: false }));
    const sendFrontend = (_req, res) => res.sendFile(path.join(frontendDirectory, "index.html"));
    app.get("/", sendFrontend);
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path === "/api" || req.path.startsWith("/api/")) {
        next();
        return;
      }
      const underBasePath = normalizedBasePath === "/"
        || req.path === normalizedBasePath.slice(0, -1)
        || req.path.startsWith(normalizedBasePath);
      if (underBasePath) sendFrontend(req, res);
      else next();
    });
  }

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api") {
      res.status(404).json({ detail: "Route introuvable." });
      return;
    }
    res.status(404).send("Not found");
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof RequestValidationError) {
      res.status(422).json({ detail: error.details });
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(422).json({
        detail: [{ loc: ["body"], msg: "JSON invalide.", type: "json_invalid" }],
      });
      return;
    }
    if (error.code === "23505") {
      res.status(409).json({ detail: "Une valeur unique est déjà utilisée." });
      return;
    }
    if (error.code === "23503" || error.code === "23514") {
      res.status(400).json({ detail: "La référence ou la valeur ne respecte pas les contraintes." });
      return;
    }
    console.error("GearTrack request failed:", error.code ?? "unexpected_error");
    res.status(500).json({ detail: "Erreur interne du serveur." });
  });

  return app;
}
