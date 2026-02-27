import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CurrentClerkId,
  CurrentUser,
} from '../../core/decorators/current-user.decorator';
import type { User } from '../../database/schema/users.schema';
import { ClerkAuthGuard } from 'src/core/guards/clerk-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Called by React Native app right after Clerk login
  // Sends Clerk JWT in Authorization header
  // Creates user in DB if first time, returns existing user otherwise
  @Post('sync')
  @UseGuards(ClerkAuthGuard)
  async sync(@CurrentClerkId() clerkId: string) {
    try {
      return this.authService.syncUser(clerkId);
    } catch (error) {
      console.error('Sync error:', error);
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  // Lightweight endpoint to verify JWT is valid + user exists in DB
  // React Native can call this on app launch to check session
  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }
}
