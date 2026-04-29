import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const logs = pgTable('logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  level: text('level').notNull(), // 'log' | 'warn' | 'error'
  context: text('context'), // class/service name e.g. 'ScansService'
  message: text('message').notNull(),
  metadata: jsonb('metadata'), // stack trace, extra args
  createdAt: timestamp('created_at').defaultNow(),
});

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
