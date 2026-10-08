import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { databaseUrl, poolConfig } from "../lib/db-url";

const url = process.env.PROD_DATABASE_URL ?? (await databaseUrl());
const pool = new Pool(poolConfig(url));
await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
await pool.end();
console.log("migrated");
