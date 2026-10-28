import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(new URL("./migrations/001_initial.sql", import.meta.url));

export async function migrate(pool) {
  const migration = await readFile(migrationPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS geartrack_schema_migrations (
        version VARCHAR(100) PRIMARY KEY
      )
    `);
    const applied = await client.query(
      "SELECT version FROM geartrack_schema_migrations WHERE version = $1",
      ["001_initial"],
    );

    if (applied.rows.length === 0) {
      await client.query(migration);
      await client.query(
        "INSERT INTO geartrack_schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
        ["001_initial"],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
