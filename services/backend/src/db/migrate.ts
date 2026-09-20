import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Pool } from 'pg';
import { config } from '../config/index.js';

import * as fsSync from 'node:fs';

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'database/migrations'),
    path.resolve(__dirname, '../../../../database/migrations'),
    path.resolve(__dirname, '../../../database/migrations'),
    path.resolve(__dirname, '../../database/migrations'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(dir)) return dir;
  }
  return candidates[0];
}

const MIGRATIONS_DIR = resolveMigrationsDir();

// Determine if we are running in production
const isProduction = process.env.NODE_ENV === 'production';

async function acquireAdvisoryLock(client: any): Promise<boolean> {
  // Use a deterministic integer key for the lock (e.g., hash of "teamtrack-migrations")
  const LOCK_KEY = 123456789;
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [LOCK_KEY]);
  return rows[0].acquired;
}

async function releaseAdvisoryLock(client: any): Promise<void> {
  const LOCK_KEY = 123456789;
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
}

async function runMigrations() {
  console.log('[Migration] Starting migration process...');

  if (!config.databaseUrl) {
    console.error('[Migration] FATAL: DATABASE_URL is required to run migrations.');
    process.exit(1);
  }

  // Create an independent pool specifically for migration
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl:
      config.databaseUrl?.includes('sslmode=require') ||
      config.databaseUrl?.includes('supabase') ||
      config.databaseUrl?.includes('neon.tech') ||
      process.env.DATABASE_SSL === 'true' ||
      (isProduction && !config.databaseUrl.includes('localhost'))
        ? { rejectUnauthorized: false }
        : undefined,
    max: 2, // Migration runner only needs 1-2 connections
  });

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    lockAcquired = await acquireAdvisoryLock(client);
    if (!lockAcquired) {
      console.error('[Migration] FATAL: Could not acquire advisory lock. Another migration runner is currently active.');
      process.exit(1);
    }

    console.log('[Migration] Advisory lock acquired.');

    // 1. Create schema_migrations table if absent
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Read applied migrations
    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // 3. Read and sort available migrations
    const files = await fs.readdir(MIGRATIONS_DIR);
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b)); // Lexicographical sort ensures chronological order

    if (sqlFiles.length === 0) {
      console.warn(`[Migration] Warning: No .sql files found in ${MIGRATIONS_DIR}`);
    }

    // 4. Determine unapplied migrations
    const pendingMigrations = sqlFiles.filter((f) => !appliedVersions.has(f));

    if (pendingMigrations.length === 0) {
      console.log('[Migration] Database is up to date. No pending migrations.');
      return;
    }

    console.log(`[Migration] Found ${pendingMigrations.length} pending migration(s) out of ${sqlFiles.length} total.`);

    // 5. Execute pending migrations
    for (const filename of pendingMigrations) {
      console.log(`[Migration] Applying: ${filename}...`);
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = await fs.readFile(filePath, 'utf8');

      // Wraps each migration in a transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        // Record success before committing
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`[Migration] Applied successfully: ${filename}`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[Migration] FATAL: Failed to apply migration: ${filename}`);
        console.error(err.message);
        // Stop immediately on failure
        process.exit(1);
      }
    }

    console.log('[Migration] All pending migrations applied successfully.');
  } catch (error: any) {
    console.error('[Migration] Unexpected error during migration process:', error);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      await releaseAdvisoryLock(client);
      console.log('[Migration] Advisory lock released.');
    }
    client.release();
    await pool.end();
  }
}

// Execute if run directly
if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[Migration] Unhandled fatal error:', err);
    process.exit(1);
  });
}

export { runMigrations };
