/**
 * Migration runner.
 *
 * Applies numbered .sql files in order and records each in schema_migrations,
 * so re-running is safe and partial application is visible. Deliberately not
 * drizzle-kit: the migration is hand-written SQL with justified indexes, and
 * generating it from the schema would lose the reasoning.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — no database is reachable here.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url).pathname;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");

  const connection = await mysql.createConnection({ uri: url, multipleStatements: true });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) NOT NULL,
      applied_at BIGINT       NOT NULL,
      PRIMARY KEY (name)
    )
  `);

  const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name as string));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      process.stdout.write(`skip   ${file}\n`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    // Each migration runs in a transaction so a failure leaves no half-applied
    // schema. Note: MySQL DDL is not transactional, so a failure mid-file still
    // requires manual inspection — the recorded state makes that visible.
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [file, Date.now()]);
      await connection.commit();
      process.stdout.write(`applied ${file}\n`);
    } catch (error) {
      await connection.rollback();
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await connection.end();
}

main().catch((error: unknown) => {
  process.stderr.write(`migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
