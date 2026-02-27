import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseService } from '../../database/database.service';
import { eq } from 'drizzle-orm';
import { users } from '../../database/schema/users.schema';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ClerkRequest } from '../interfaces/clerk-request.interface';

// Runs after ClerkAuthGuard — looks up DB user by clerk_id
// and attaches it to request['user'] so @CurrentUser() works
@Injectable()
export class AttachUserInterceptor implements NestInterceptor {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const request = context.switchToHttp().getRequest<ClerkRequest>();
    const clerkPayload = request.clerkPayload;
    if (!clerkPayload) return next.handle();

    const clerkId = clerkPayload.sub;

    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!user) {
      return next.handle();

      // throw new UnauthorizedException(
      //   'User not found. Please call POST /auth/sync first.',
      // );
    }

    // attach DB user to request — available via @CurrentUser()
    request['user'] = user;

    return next.handle();
  }
}
