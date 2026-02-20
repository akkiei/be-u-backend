import * as dotenv from 'dotenv';
dotenv.config();
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const db = drizzle(pool);

  // enable extensions before running migrations
  // this is required for vector db column
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log('Extensions enabled');

  await migrate(db, { migrationsFolder: './src/database/migrations' });
  console.log('Migrations complete');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
