import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { scanHistory } from './scan-history.schema';

export const allergenFlags = pgTable('allergen_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id')
    .notNull()
    .references(() => scanHistory.id, { onDelete: 'cascade' }),
  allergen: text('allergen').notNull(), // e.g. 'parabens'
  foundIn: text('found_in').notNull(), // e.g. 'Neutrogena Hydro Boost'
  flaggedAt: timestamp('flagged_at').defaultNow(),
});

export const allergenFlagsRelations = relations(allergenFlags, ({ one }) => ({
  user: one(users, { fields: [allergenFlags.userId], references: [users.id] }),
  scan: one(scanHistory, {
    fields: [allergenFlags.scanId],
    references: [scanHistory.id],
  }),
}));

export type AllergenFlag = typeof allergenFlags.$inferSelect;
export type NewAllergenFlag = typeof allergenFlags.$inferInsert;
