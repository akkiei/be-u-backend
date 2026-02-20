import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.schema';

export const userSummaries = pgTable('user_summaries', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  recentMedications: jsonb('recent_medications').default(sql`'[]'`), // last 10 meds (OTC + prescribed)
  recentFood: jsonb('recent_food').default(sql`'[]'`), // last 10 food scans
  recentMakeup: jsonb('recent_makeup').default(sql`'[]'`), // last 10 makeup scans
  recentPrescriptions: jsonb('recent_prescriptions').default(sql`'[]'`), // last 5 prescriptions
  flaggedIngredients: text('flagged_ingredients')
    .array()
    .default(sql`'{}'`),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export const userSummariesRelations = relations(userSummaries, ({ one }) => ({
  user: one(users, { fields: [userSummaries.userId], references: [users.id] }),
}));

export type UserSummary = typeof userSummaries.$inferSelect;
export type NewUserSummary = typeof userSummaries.$inferInsert;
