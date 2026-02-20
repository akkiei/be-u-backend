import { Module, Global } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DatabaseService } from './database.service';

@Global() // <-- global so every module can inject without re-importing
@Module({
  providers: [
    {
      provide: 'DB',
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        return drizzle(pool, { schema });
      },
    },
    DatabaseService,
  ],
  exports: ['DB', DatabaseService],
})
export class DatabaseModule {}
