import { pathToFileURL } from "node:url";
import pg from "pg";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";

const { Pool } = pg;

export async function startServer(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured.");
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  const trailFactor = Number(env.WEAR_TRAIL_FACTOR ?? 1.25);
  const elevationFactor = Number(env.WEAR_ELEVATION_FACTOR_PER_100M ?? 0.03);
  if (!Number.isFinite(trailFactor) || trailFactor < 1 || !Number.isFinite(elevationFactor) || elevationFactor < 0) {
    throw new Error("Wear factors are invalid.");
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", () => {
    console.error("Unexpected PostgreSQL pool error.");
  });

  try {
    await migrate(pool);
    const app = createApp({
      pool,
      wearTrailFactor: trailFactor,
      wearElevationFactorPer100m: elevationFactor,
      basePath: env.BASE_PATH ?? "/",
    });
    const server = await new Promise((resolve, reject) => {
      const listeningServer = app.listen(port, "0.0.0.0", () => resolve(listeningServer));
      listeningServer.once("error", reject);
    });

    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await pool.end();
    };

    process.once("SIGTERM", close);
    process.once("SIGINT", close);
    return { server, pool, close };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("GearTrack server could not start:", error.code ?? error.message);
    process.exitCode = 1;
  });
}
