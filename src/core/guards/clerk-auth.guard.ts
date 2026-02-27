import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ClerkRequest } from '../interfaces/clerk-request.interface';

import * as dotenv from 'dotenv';
dotenv.config();
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly secretKey: string;

  constructor(private reflector: Reflector) {
    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY is not defined');
    }
    this.secretKey = process.env.CLERK_SECRET_KEY;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<ClerkRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    console.log('Full token:', token);

    try {
      const payload = await verifyToken(token, {
        secretKey: this.secretKey,
      });
      console.log('token payload: ', payload);

      request.clerkPayload = { sub: String(payload.sub) };
      return true;
    } catch (error: unknown) {
      console.error('Token verification failed:', error);
      const message =
        error instanceof Error ? error.message : 'Invalid or expired token';
      throw new UnauthorizedException(message);
    }
  }

  private extractToken(request: ClerkRequest): string | null {
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    const type = parts[0];
    const token = parts[1];

    if (type !== 'Bearer' || !token) return null;
    return token;
  }
}
