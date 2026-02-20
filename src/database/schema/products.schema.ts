import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { scanHistory } from './scan-history.schema';
import { scannedLabels } from './labels.schema';
import { scannedIngredients } from './ingredients.schema';
import { medications } from './medications.schema';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  productType: text('product_type'), // 'medication' | 'food' | 'makeup' | 'unknown'
  productName: text('product_name'),
  brand: text('brand'),
  manufacturer: text('manufacturer'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, { fields: [products.userId], references: [users.id] }),
  scanHistory: many(scanHistory),
  label: one(scannedLabels), // one label scan per product
  ingredients: many(scannedIngredients), // many ingredient rows per product
  medications: many(medications), // OTC meds linked via product
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
