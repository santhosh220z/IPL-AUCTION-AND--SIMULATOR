import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

let pool = null;

export async function connectDatabase(connectionString = env.supabaseDbUrl) {
  const conn = String(connectionString || "").trim();
  if (!conn) {
    throw new Error(
      "Supabase DB URL is missing. Set SUPABASE_DB_URL (or DATABASE_URL/POSTGRES_URL), or provide NEXT_PUBLIC_SUPABASE_URL with SUPABASE_DB_PASSWORD."
    );
  }

  pool = new Pool({
    connectionString: conn,
    ssl: env.supabaseDbSsl ? { rejectUnauthorized: false } : false
  });

  await pool.query("select 1");
}

export function getDbPool() {
  if (!pool) {
    throw new Error("Database pool is not initialized. Call connectDatabase() first.");
  }
  return pool;
}

export async function dbQuery(text, params = []) {
  const activePool = getDbPool();
  const result = await activePool.query(text, params);
  return result.rows;
}

export async function withTransaction(handler) {
  const activePool = getDbPool();
  const client = await activePool.connect();

  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
