import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// use @Public() on any route that should skip ClerkAuthGuard
// e.g. health check, webhook endpoints
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
