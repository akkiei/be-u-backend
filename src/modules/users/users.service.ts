import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { userProfiles } from '../../database/schema/user-profiles.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(@Inject('DB') private db: NodePgDatabase<typeof schema>) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const [profile] = await this.db
      .update(userProfiles)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.age !== undefined && { age: dto.age }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.skinType !== undefined && { skinType: dto.skinType }),
        ...(dto.allergies !== undefined && { allergies: dto.allergies }),
        ...(dto.conditions !== undefined && { conditions: dto.conditions }),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    return profile;
  }

  async getProfile(userId: string) {
    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    return profile ?? null;
  }
}
