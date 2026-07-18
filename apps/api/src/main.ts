import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { readEnvironment } from './config/env';
import { HttpExceptionFilter } from './http-exception.filter';

async function bootstrap() {
  const environment = readEnvironment();
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  app.enableCors({ origin: 'http://localhost:3000' });

  const swagger = new DocumentBuilder()
    .setTitle('Galaxy OS ERP API')
    .setDescription('Internal REST API for Galaxy Centre operations')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(environment.API_PORT);
}

void bootstrap();
