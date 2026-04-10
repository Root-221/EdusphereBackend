import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PrismaModule } from '@database/prisma.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from '@common/guards/roles.guard';
import { EmailModule } from '@common/email/email.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    PrismaModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    LocalStrategy,
    JwtStrategy,
    RolesGuard,
  ],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
