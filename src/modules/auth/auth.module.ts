import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService], // exported so other modules can call findByClerkId if needed
})
export class AuthModule {}
