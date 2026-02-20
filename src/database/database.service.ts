import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject('DB') public readonly db: NodePgDatabase<typeof schema>,
  ) {}
}
