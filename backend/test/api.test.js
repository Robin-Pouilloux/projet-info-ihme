import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";
import { newDb } from "pg-mem";
import { createApp } from "../app.js";
import { migrate } from "../migrate.js";

let db;
let pool;
let app;

beforeEach(async () => {
  db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const adapter = db.adapters.createPg();
  pool = new adapter.Pool();
  await migrate(pool);
  await migrate(pool);
  app = createApp({ pool });
});

afterEach(async () => {
  await pool.end();
});

test("health verifies database connectivity", async () => {
  const response = await request(app).get("/api/health").expect(200);
  assert.deepEqual(response.body, { status: "ok" });

  const unavailable = await request(createApp({
    pool: { query: async () => { throw new Error("database down"); } },
  })).get("/api/health").expect(503);
  assert.deepEqual(unavailable.body, { detail: { status: "unavailable" } });
});

test("bike, component, ride, maintenance CRUD and dashboard values match the API", async () => {
  const bike = await request(app).post("/api/bikes")
    .send({ name: "Route", current_odometer_km: 50 })
    .expect(201);
  assert.equal(bike.body.current_odometer_km, 50);

  const component = await request(app).post(`/api/bikes/${bike.body.id}/components`)
    .send({ name: "Chaîne", installed_km: 0, maintenance_interval_km: 500 })
    .expect(201);
  await request(app).patch(`/api/components/${component.body.id}`)
    .send({ name: "Chaîne neuve" })
    .expect(200);
  const ride = await request(app).post(`/api/bikes/${bike.body.id}/rides`)
    .send({ occurred_on: "2026-10-28", distance_km: 520, duration_minutes: 100, elevation_m: 500 })
    .expect(201);
  assert.equal(ride.body.ride_type, "route");

  await request(app).post("/api/maintenance")
    .send({
      bike_id: bike.body.id + 99,
      component_id: component.body.id,
      operation: "Lubrification",
      performed_on: "2026-10-28",
      bike_km: 520,
    })
    .expect(404);
  await request(app).post("/api/maintenance")
    .send({
      bike_id: bike.body.id,
      component_id: component.body.id,
      operation: "Lubrification",
      performed_on: "2026-10-28",
      bike_km: 520,
      cost_eur: 8.5,
    })
    .expect(201);
  await migrate(pool);
  assert.equal((await request(app).get("/api/bikes").expect(200)).body.length, 1);
  assert.equal((await request(app).get(`/api/bikes/${bike.body.id}/components`).expect(200)).body.length, 1);
  assert.equal((await request(app).get(`/api/bikes/${bike.body.id}/rides`).expect(200)).body.length, 1);
  assert.equal((await request(app).get("/api/maintenance").expect(200)).body.length, 1);

  const dashboard = await request(app).get("/api/dashboard").expect(200);
  assert.equal(dashboard.body.bike_count, 1);
  assert.equal(dashboard.body.bike_km, 520);
  assert.equal(dashboard.body.upcoming_maintenance[0].overdue, false);
  assert.equal(dashboard.body.upcoming_maintenance[0].due_at_km, 1020);

  await request(app).delete(`/api/components/${component.body.id}`).expect(204);
  await request(app).patch(`/api/bikes/${bike.body.id}`).send({ name: "Route v2" }).expect(200);
  await request(app).delete(`/api/bikes/${bike.body.id}`).expect(204);
  assert.deepEqual((await request(app).get("/api/bikes").expect(200)).body, []);
});

test("running shoe validation, surface balance, statistics, and assessments", async () => {
  assert.equal((await request(app).get("/api/shoes").expect(200)).body.length, 0);
  const shoe = await request(app).post("/api/shoes").send({ name: "Trail", shoe_type: "trail" }).expect(201);
  await request(app).post(`/api/shoes/${shoe.body.id}/runs`)
    .send({
      occurred_on: "2026-10-28",
      distance_km: 10,
      duration_minutes: 60,
      elevation_m: 500,
      steps: 12000,
      road_km: 2,
      trail_km: 8,
    })
    .expect(201);
  assert.equal((await request(app).get(`/api/shoes/${shoe.body.id}/runs`).expect(200)).body.length, 1);
  await request(app).post(`/api/shoes/${shoe.body.id}/runs`)
    .send({
      occurred_on: "2026-10-28",
      distance_km: 10,
      duration_minutes: 60,
      road_km: 3,
      trail_km: 6,
    })
    .expect(422);

  const stats = await request(app).get(`/api/shoes/${shoe.body.id}/stats`).expect(200);
  assert.equal(stats.body.actual_km, 10);
  assert.equal(stats.body.run_count, 1);
  assert.equal(stats.body.road_percent, 20);
  assert.equal(stats.body.trail_percent, 80);
  assert.ok(stats.body.estimated_wear_km > stats.body.actual_km);

  await request(app).post(`/api/shoes/${shoe.body.id}/assessments`)
    .send({
      assessed_on: "2026-10-28",
      sole_score: 6,
      grip_score: 4,
      cushion_score: 4,
      comfort_score: 4,
    })
    .expect(422);
  await request(app).post(`/api/shoes/${shoe.body.id}/assessments`)
    .send({
      assessed_on: "2026-10-28",
      sole_score: 4,
      grip_score: 3,
      cushion_score: 4,
      comfort_score: 5,
    })
    .expect(201);
  assert.equal((await request(app).get(`/api/shoes/${shoe.body.id}/assessments`).expect(200)).body.length, 1);
  await request(app).patch(`/api/shoes/${shoe.body.id}`).send({ name: "Trail v2" }).expect(200);
  await request(app).delete(`/api/shoes/${shoe.body.id}`).expect(204);
});

test("unknown API routes return a JSON 404", async () => {
  const response = await request(app).get("/api/not-real").expect(404);
  assert.equal(response.body.detail, "Route introuvable.");
  assert.equal((await request(app).get("/openapi.json").expect(200)).body.paths["/api/shoes/{shoe_id}/stats"].get.summary, "Statistiques d'usure");
});
