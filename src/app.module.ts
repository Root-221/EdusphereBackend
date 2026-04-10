import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@database/prisma.module';
import { AuthModule } from '@modules/auth/auth.module';
import { SuperAdminModule } from '@modules/super-admin/super-admin.module';
import { InfrastructureModule } from '@modules/infrastructure/infrastructure.module';
import { AcademicModule } from '@modules/school-admin/academic/academic.module';
import { EnrollmentModule } from '@modules/school-admin/enrollments/enrollment.module';
import { SchoolProfileModule } from '@modules/school-admin/school-profile/school-profile.module';
import { UsersModule } from '@modules/school-admin/users/users.module';
import { HealthController } from './app/health.controller';
import { RootController } from './app/root.controller';
import { TenantMiddleware } from '@common/middleware/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    SuperAdminModule,
    InfrastructureModule,
    AcademicModule,
    EnrollmentModule,
    SchoolProfileModule,
    UsersModule,
  ],
  controllers: [HealthController, RootController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Le TenantMiddleware s'exécute sur toutes les routes.
    // Il attache req.school si X-Tenant-Slug est présent et valide.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
