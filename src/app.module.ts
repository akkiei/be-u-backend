import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClerkAuthGuard } from './core/guards/clerk-auth.guard';
import { AttachUserInterceptor } from './core/interceptors/attach-user.interceptor';
import { UploadModule } from './modules/imageUploads/upload.module';
import { ScansModule } from './modules/scans/scans.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    DatabaseModule, // global — no need to import in other modules
    AuthModule,
    UsersModule,
    UploadModule,
    ScansModule,
    // ... other modules
  ],
  controllers: [AppController],
  providers: [
    // ClerkAuthGuard runs on EVERY request globally
    // use @Public() decorator to opt out per route
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    // AttachUserInterceptor runs after guard
    // looks up DB user by clerk_id and attaches to request
    {
      provide: APP_INTERCEPTOR,
      useClass: AttachUserInterceptor,
    },
  ],
})
export class AppModule {}
