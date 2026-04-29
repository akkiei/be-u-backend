import { Module } from '@nestjs/common';
import { DbLoggerService } from './db-logger.service';

@Module({
  providers: [DbLoggerService],
  exports: [DbLoggerService],
})
export class LoggerModule {}
