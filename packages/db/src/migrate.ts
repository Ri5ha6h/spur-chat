import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createPool } from "./client.js";

config({ path: new URL("../../../.env", import.meta.url) });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = createPool(databaseUrl);
const db = createDb(pool);

await migrate(db, { migrationsFolder: "drizzle" });
await pool.end();
