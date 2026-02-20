import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.schema';
import { products } from './products.schema';
import { scanHistory } from './scan-history.schema';

export const scannedLabels = pgTable('scanned_labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id')
    .unique()
    .notNull()
    .references(() => scanHistory.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiryDate: text('expiry_date'),
  batchInfo: text('batch_info'),
  usageDirections: text('usage_directions'),
  warnings: text('warnings')
    .array()
    .default(sql`'{}'`),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

export const scannedLabelsRelations = relations(scannedLabels, ({ one }) => ({
  scan: one(scanHistory, {
    fields: [scannedLabels.scanId],
    references: [scanHistory.id],
  }),
  product: one(products, {
    fields: [scannedLabels.productId],
    references: [products.id],
  }),
  user: one(users, { fields: [scannedLabels.userId], references: [users.id] }),
}));

export type ScannedLabel = typeof scannedLabels.$inferSelect;
export type NewScannedLabel = typeof scannedLabels.$inferInsert;
