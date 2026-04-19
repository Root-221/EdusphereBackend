import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0'; // CHANGÉ: 0.0.0.0 au lieu de 127.0.0.1 pour être visible par Render
  
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  app.setGlobalPrefix('api');
  
  // Enable API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  
  // Global pipes & interceptors
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  app.useGlobalInterceptors(
    new TransformInterceptor(),
  );
  
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger amélioré avec seed data
  const config = new DocumentBuilder()
    .setTitle('EduSphere Central API')
    .setDescription('API centrale Edusphere - Gestion écoles/lycées, emplois du temps, notes, paiements...\n\n**Seed users (Password123!):**\n• superadmin@edusphere.sn (SUPER_ADMIN)\n• admin@lycee-excellence.sn (SCHOOL_ADMIN)\n• teacher/student/parent/comptable@lycee-excellence.sn')
    .setVersion('1.0')
    .addServer(`http://localhost:${port}`, 'Development')
    .addServer('https://api.edusphere.sn', 'Production')
    .addBearerAuth({
      description: `JWT Bearer auth.\nEx: POST /api/v1/auth/login → {"email": "superadmin@edusphere.sn", "password": "Password123!"}`,
      name: 'Authorization',
      bearerFormat: 'Bearer',
      type: 'http',
      scheme: 'bearer',
      in: 'header',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(port, host);
  
  const baseUrl = `http://localhost:${port}`;
  console.log(`🚀 Backend running on ${baseUrl}`);
  console.log(`📚 API: ${baseUrl}/api/v1`);
  console.log(`🔍 Health: ${baseUrl}/api/v1/health`);
  console.log(`🔐 Login: ${baseUrl}/api/v1/auth/login`);
  console.log(`📖 Swagger: ${baseUrl}/api-docs`);
}

bootstrap();
