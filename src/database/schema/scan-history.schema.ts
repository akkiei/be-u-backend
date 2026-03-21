import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { vector } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { images } from './images.schema';
import { products } from './products.schema';
import { scannedLabels } from './labels.schema';
import { scannedIngredients } from './ingredients.schema';
import { scannedPrescriptions } from './prescriptions.schema';
import { allergenFlags } from './allergen-flags.schema';
import { recommendations } from './recommendations.schema';

export const scanHistory = pgTable('scan_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  imageId: uuid('image_id').references(() => images.id, {
    onDelete: 'set null',
  }),
  backImageId: uuid('back_image_id').references(() => images.id, {
    onDelete: 'set null',
  }),
  productId: uuid('product_id').references(() => products.id, {
    onDelete: 'set null',
  }), // null for prescriptions
  frontImageUrl: text('front_image_url'),
  backImageUrl: text('back_image_url'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  scanType: text('scan_type').notNull(), // 'label' | 'ingredients' | 'prescription' | 'lab_report'
  rawOcrText: text('raw_ocr_text'),
  parsedResult: jsonb('parsed_result').notNull(),
  embedding: vector('embedding', { dimensions: 384 }), // all-MiniLM-L6-v2 embeddings
  confidence: text('confidence'), // 'high' | 'medium' | 'low'
  llmSummary: text('llm_summary'),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

export const scanHistoryRelations = relations(scanHistory, ({ one, many }) => ({
  user: one(users, { fields: [scanHistory.userId], references: [users.id] }),
  image: one(images, {
    fields: [scanHistory.imageId],
    references: [images.id],
    relationName: 'frontImage',
  }),
  backImage: one(images, {
    fields: [scanHistory.backImageId],
    references: [images.id],
    relationName: 'backImage',
  }),
  product: one(products, {
    fields: [scanHistory.productId],
    references: [products.id],
  }),
  label: one(scannedLabels),
  prescription: one(scannedPrescriptions),
  ingredients: many(scannedIngredients),
  allergenFlags: many(allergenFlags),
  recommendations: many(recommendations),
}));

export type ScanHistory = typeof scanHistory.$inferSelect;
export type NewScanHistory = typeof scanHistory.$inferInsert;
