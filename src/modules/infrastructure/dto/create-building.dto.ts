import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { BuildingStatusEnum, type BuildingStatus } from '../infrastructure.types';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Bâtiment A - Principal' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Bâtiment principal des salles de classe.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  floorCount?: number;

  @ApiPropertyOptional({ enum: BuildingStatusEnum, default: BuildingStatusEnum.active })
  @IsOptional()
  @IsEnum(BuildingStatusEnum)
  status?: BuildingStatus;
}
