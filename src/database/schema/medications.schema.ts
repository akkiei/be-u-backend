import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { products } from './products.schema';
import { scannedPrescriptions } from './prescriptions.schema';

export const medications = pgTable('medications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // one of these will be set depending on source — never both
  prescriptionId: uuid('prescription_id').references(
    () => scannedPrescriptions.id,
    { onDelete: 'set null' },
  ),
  productId: uuid('product_id').references(() => products.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  dosage: text('dosage'),
  frequency: text('frequency'),
  duration: text('duration'),
  instructions: text('instructions'),
  source: text('source').notNull(), // 'prescription' | 'otc_label'
  addedAt: timestamp('added_at').defaultNow(),
});

export const medicationsRelations = relations(medications, ({ one }) => ({
  user: one(users, { fields: [medications.userId], references: [users.id] }),
  prescription: one(scannedPrescriptions, {
    fields: [medications.prescriptionId],
    references: [scannedPrescriptions.id],
  }),
  product: one(products, {
    fields: [medications.productId],
    references: [products.id],
  }),
}));

export type Medication = typeof medications.$inferSelect;
export type NewMedication = typeof medications.$inferInsert;
