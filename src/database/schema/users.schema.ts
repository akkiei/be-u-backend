import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userProfiles } from './user-profiles.schema';
import { images } from './images.schema';
import { allergenFlags } from './allergen-flags.schema';
import { medications } from './medications.schema';
import { scannedPrescriptions } from './prescriptions.schema';
import { products } from './products.schema';
import { recommendations } from './recommendations.schema';
import { scanHistory } from './scan-history.schema';
import { userSummaries } from './user-summaries.schema';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique().notNull(),
  email: text('email').unique().notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles),
  summary: one(userSummaries),
  images: many(images),
  products: many(products),
  scanHistory: many(scanHistory),
  medications: many(medications),
  prescriptions: many(scannedPrescriptions),
  allergenFlags: many(allergenFlags),
  recommendations: many(recommendations),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
