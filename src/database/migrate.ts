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
      console.log(
        `[migrate] Attempt ${attempt}/${MAX_RETRIES} — connecting to DB...`,
      );
      await pool.query('SELECT 1');
      console.log('[migrate] Connection ok');

      const db = drizzle(pool);

      console.log('[migrate] Enabling extensions...');
      await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('[migrate] Extensions enabled');

      console.log('[migrate] Running migrations...');
      await migrate(db, { migrationsFolder: './src/database/migrations' });
      console.log('[migrate] Migrations complete');

      await pool.end();
      return;
    } catch (err) {
      const error = err as Error & { code?: string; cause?: Error };
      console.error(`[migrate] Attempt ${attempt}/${MAX_RETRIES} failed`);
      console.error(`[migrate] Error: ${error.message}`);
      console.error(`[migrate] Code: ${error.code ?? 'n/a'}`);
      if (error.cause) console.error(`[migrate] Cause: ${error.cause.message}`);
      console.error(`[migrate] Stack: ${error.stack}`);

      await pool.end().catch(() => {});

      if (attempt === MAX_RETRIES) {
        console.error('[migrate] All attempts exhausted, giving up');
        throw err;
      }
      console.log(`[migrate] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
