import pg, { PoolClient } from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.database.poolMax,
  idleTimeoutMillis: config.database.idleTimeoutMs,
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
  statement_timeout: config.database.statementTimeoutMs,
  ssl:
    config.databaseUrl?.includes('sslmode=require') ||
    config.databaseUrl?.includes('supabase') ||
    config.databaseUrl?.includes('neon.tech') ||
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on('error', (err) => {
  console.error('[Database Pool Error] Unexpected idle client error:', err.message);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Database Transaction] Rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(timeoutMs = 2000): Promise<boolean> {
  try {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs);
      timer.unref();
    });

    const queryPromise = pool.query('SELECT 1');
    await Promise.race([queryPromise, timeoutPromise]);
    clearTimeout(timer!);
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
