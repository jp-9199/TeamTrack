import pg from 'pg';

async function main() {
  const client = new pg.Client({
    host: 'localhost',
    port: 1310,
    user: 'postgres',
    database: 'postgres',
  });

  await client.connect();
  console.log('Connected to postgres superuser');

  // Set password for postgres
  await client.query(`ALTER USER postgres WITH PASSWORD 'traderasad856'`);
  console.log('Postgres password set to traderasad856');

  // Check or create teamtrack user
  const userCheck = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'teamtrack'`);
  if (userCheck.rowCount === 0) {
    await client.query(`CREATE USER teamtrack WITH PASSWORD 'teamtrack' SUPERUSER CREATEDB`);
    console.log('Created user teamtrack');
  } else {
    await client.query(`ALTER USER teamtrack WITH PASSWORD 'teamtrack' SUPERUSER CREATEDB`);
    console.log('Updated user teamtrack');
  }

  // Check or create teamtrack_dev database
  const dbCheck = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'teamtrack_dev'`);
  if (dbCheck.rowCount === 0) {
    await client.query(`CREATE DATABASE teamtrack_dev OWNER teamtrack`);
    console.log('Created database teamtrack_dev');
  } else {
    console.log('Database teamtrack_dev already exists');
  }

  // Reload config
  await client.query(`SELECT pg_reload_conf()`);
  console.log('pg_reload_conf() executed');

  await client.end();
}

main().catch(console.error);
