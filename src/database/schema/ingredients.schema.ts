import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { products } from './products.schema';
import { scanHistory } from './scan-history.schema';

export const scannedIngredients = pgTable('scanned_ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id')
    .notNull()
    .references(() => scanHistory.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  purpose: text('purpose'), // 'preservative' | 'active ingredient' | 'emulsifier' | etc
  isAllergen: boolean('is_allergen').default(false),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

export const scannedIngredientsRelations = relations(
  scannedIngredients,
  ({ one }) => ({
    scan: one(scanHistory, {
      fields: [scannedIngredients.scanId],
      references: [scanHistory.id],
    }),
    product: one(products, {
      fields: [scannedIngredients.productId],
      references: [products.id],
    }),
    user: one(users, {
      fields: [scannedIngredients.userId],
      references: [users.id],
    }),
  }),
);

export type ScannedIngredient = typeof scannedIngredients.$inferSelect;
export type NewScannedIngredient = typeof scannedIngredients.$inferInsert;
