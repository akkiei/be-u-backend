import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.schema';

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .unique()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name'),
  age: integer('age'),
  gender: text('gender'), // 'male' | 'female' | 'other'
  skinType: text('skin_type'), // 'oily' | 'dry' | 'combination' | 'sensitive' | 'normal'
  allergies: text('allergies')
    .array()
    .default(sql`'{}'`),
  conditions: text('conditions')
    .array()
    .default(sql`'{}'`),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
