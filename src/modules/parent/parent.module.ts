import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ParentController],
  providers: [ParentService],
  exports: [ParentService],
})
export class ParentModule {}