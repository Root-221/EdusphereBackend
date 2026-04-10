import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SchoolStatus } from '@prisma/client';

export class UpdateSchoolStatusDto {
  @ApiProperty({ enum: SchoolStatus })
  @IsEnum(SchoolStatus)
  status: SchoolStatus;
}
