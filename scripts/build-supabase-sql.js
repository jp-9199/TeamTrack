const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../database/migrations');
const targetFile = path.resolve(__dirname, '../database/init_supabase_schema.sql');

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

let combined = `-- ==========================================================================
-- TeamTrack Complete Consolidated Database Schema for Supabase / Cloud Postgres
-- ==========================================================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema Migrations Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

`;

for (const file of files) {
  combined += `-- --------------------------------------------------------------------------\n`;
  combined += `-- Migration: ${file}\n`;
  combined += `-- --------------------------------------------------------------------------\n`;
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  combined += content.trim() + '\n\n';
  combined += `INSERT INTO schema_migrations (version) VALUES ('${file}') ON CONFLICT (version) DO NOTHING;\n\n`;
}

fs.writeFileSync(targetFile, combined, 'utf8');
console.log(`Generated ${targetFile} successfully (${(combined.length / 1024).toFixed(1)} KB, ${files.length} migrations)`);
