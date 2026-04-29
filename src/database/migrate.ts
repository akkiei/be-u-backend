import * as dotenv from 'dotenv';
dotenv.config();
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connection established');
      return;
    } catch (err) {
      console.warn(
        `DB connection attempt ${attempt}/${MAX_RETRIES} failed: ${(err as Error).message}`,
      );
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
  }
}

async function main() {
  await waitForDb();

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
