import * as dotenv from 'dotenv';
dotenv.config();
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

async function main() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 1,
    });

    try {
      const db = drizzle(pool);

      await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('Extensions enabled');

      await migrate(db, { migrationsFolder: './src/database/migrations' });
      console.log('Migrations complete');

      await pool.end();
      return;
    } catch (err) {
      await pool.end().catch(() => {});
      console.warn(
        `Migration attempt ${attempt}/${MAX_RETRIES} failed: ${(err as Error).message}`,
      );
      if (attempt === MAX_RETRIES) {
        console.error('All migration attempts exhausted');
        throw err;
      }
      console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
