import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('API')
@Controller()
export class RootController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Accueil API EduSphere' })
  @ApiResponse({ status: 200, description: 'Accueil et statut API' })
  async root() {
    let dbStatus = 'unavailable';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch (error) {
      console.error('DB check failed:', error);
      dbStatus = 'error';
    }
    return {
      message: 'Welcome to EduSphere API',
      version: '1.0.0',
      status: 'healthy',
      database: dbStatus,
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/login',
        docs: '/api-docs',
      },
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Statut serveur' })
  @ApiResponse({ status: 200, description: 'Statut serveur détaillé' })
  async status() {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
    };
  }
}


