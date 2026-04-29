import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { users } from '../../database/schema/users.schema';
import { userProfiles } from '../../database/schema/user-profiles.schema';
import { userSummaries } from '../../database/schema/user-summaries.schema';
import { eq } from 'drizzle-orm';
import { createClerkClient } from '@clerk/backend';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private clerk;
  constructor(private readonly dbService: DatabaseService) {
    this.clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }

  // Called on first login from React Native app
  // Creates user + profile + summary rows if they don't exist
  // Safe to call on every login — idempotent
  async syncUser(clerkId: string) {
    const db = this.dbService.db;

    // check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (existing) {
      this.logger.log(`User already synced:`);
      this.logger.log(existing);
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, existing.id))
        .limit(1);
      return { user: existing, profile: profile ?? null, isNew: false };
    }
    this.logger.log(`User NOT synced: ${clerkId}`);

    const clerkUser = await this.clerk.users.getUser(clerkId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    const phoneNo = clerkUser.phoneNumbers[0]?.phoneNumber;

    // create user + profile + summary in a transaction
    // so either all three are created or none are
    const result = await db.transaction(async (tx) => {
      // 1. create user row
      const [newUser] = await tx
        .insert(users)
        .values({
          clerkId,
          email: email,
          phone: phoneNo ?? null,
        })
        .returning();

      // 2. create empty profile row
      const [newProfile] = await tx
        .insert(userProfiles)
        .values({ userId: newUser.id })
        .returning();

      // 3. create empty summary row
      await tx.insert(userSummaries).values({ userId: newUser.id });

      return { user: newUser, profile: newProfile };
    });

    this.logger.log(`New user synced: ${clerkId}`);
    return { user: result.user, profile: result.profile, isNew: true };
  }

  // Returns DB user by clerk_id — used internally by AttachUserInterceptor
  async findByClerkId(clerkId: string) {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    return user ?? null;
  }
}
