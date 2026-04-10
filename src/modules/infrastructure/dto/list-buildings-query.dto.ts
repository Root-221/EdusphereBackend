import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuildingStatusEnum, type BuildingStatus } from '../infrastructure.types';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListBuildingsQueryDto {
  @ApiPropertyOptional({ example: 'Bâtiment', description: 'Recherche par nom ou description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BuildingStatusEnum, description: 'Filtre par statut' })
  @IsOptional()
  @IsEnum(BuildingStatusEnum)
  status?: BuildingStatus;
}
