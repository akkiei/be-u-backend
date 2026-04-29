import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import multipart from '@fastify/multipart';
import { DbLoggerService } from './core/logger/db-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.useLogger(app.get(DbLoggerService));
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB fiel size
    },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS for your React Native app
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  const port = process.env.PORT || 3000;
  // Crucial: '0.0.0.0' allows external traffic to reach the server
  await app.listen(port, '0.0.0.0');
}
bootstrap();
