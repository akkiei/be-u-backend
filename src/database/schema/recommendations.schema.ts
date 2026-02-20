import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.schema';
import { scanHistory } from './scan-history.schema';

export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').references(() => scanHistory.id, {
    onDelete: 'set null',
  }),
  recommendation: text('recommendation').notNull(),
  warnings: text('warnings')
    .array()
    .default(sql`'{}'`),
  safeToUse: boolean('safe_to_use'),
  reasoning: text('reasoning'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const recommendationsRelations = relations(
  recommendations,
  ({ one }) => ({
    user: one(users, {
      fields: [recommendations.userId],
      references: [users.id],
    }),
    scan: one(scanHistory, {
      fields: [recommendations.scanId],
      references: [scanHistory.id],
    }),
  }),
);

export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;
