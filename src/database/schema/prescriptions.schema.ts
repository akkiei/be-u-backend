import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { scanHistory } from './scan-history.schema';
import { medications } from './medications.schema';

export const scannedPrescriptions = pgTable('scanned_prescriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id')
    .unique()
    .notNull()
    .references(() => scanHistory.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  hospitalName: text('hospital_name'),
  doctorName: text('doctor_name'),
  doctorSpecialization: text('doctor_specialization'),
  doctorContact: text('doctor_contact'),
  patientName: text('patient_name'),
  diagnosis: text('diagnosis'),
  prescriptionDate: text('prescription_date'),
  refills: text('refills'),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

export const scannedPrescriptionsRelations = relations(
  scannedPrescriptions,
  ({ one, many }) => ({
    scan: one(scanHistory, {
      fields: [scannedPrescriptions.scanId],
      references: [scanHistory.id],
    }),
    user: one(users, {
      fields: [scannedPrescriptions.userId],
      references: [users.id],
    }),
    medications: many(medications), // all meds listed on this prescription
  }),
);

export type ScannedPrescription = typeof scannedPrescriptions.$inferSelect;
export type NewScannedPrescription = typeof scannedPrescriptions.$inferInsert;
