import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../database/schema/users.schema';

// usage: @CurrentUser() user: User
// returns the full DB user row attached by AuthService.attachUser()
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<{ user?: User }>();
    return request.user as User;
  },
);

// usage: @CurrentClerkId() clerkId: string
// returns just the clerk_id from the verified JWT payload
// useful before user is synced to DB
export const CurrentClerkId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ clerkPayload?: { sub: string } }>();

    return request.clerkPayload?.sub as string;
  },
);
