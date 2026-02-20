import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { scanHistory } from './scan-history.schema';

export const images = pgTable('images', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  oracleBucket: text('oracle_bucket').notNull(), // Oracle Cloud bucket name
  oracleKey: text('oracle_key').notNull(), // object path inside the bucket
  url: text('url').notNull(), // pre-signed or public URL
  scanType: text('scan_type').notNull(), // 'label' | 'ingredients' | 'prescription'
  mimeType: text('mime_type').default('image/jpeg'),
  sizeBytes: integer('size_bytes'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

export const imagesRelations = relations(images, ({ one }) => ({
  user: one(users, { fields: [images.userId], references: [users.id] }),
  scan: one(scanHistory),
}));

export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
