import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  RoomStatusEnum,
  RoomTypeEnum,
  type RoomStatus,
  type RoomType,
} from '../infrastructure.types';

export class ListRoomsQueryDto {
  @ApiPropertyOptional({ example: 'Salle', description: 'Recherche par nom, description, équipement ou bâtiment' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'cmbx123room01', description: 'Filtrer sur un bâtiment' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({ enum: RoomStatusEnum, description: 'Filtre par statut' })
  @IsOptional()
  @IsEnum(RoomStatusEnum)
  status?: RoomStatus;

  @ApiPropertyOptional({ enum: RoomTypeEnum, description: 'Filtre par type de salle' })
  @IsOptional()
  @IsEnum(RoomTypeEnum)
  roomType?: RoomType;

  @ApiPropertyOptional({ example: 1, description: 'Filtre par étage' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  floor?: number;
}
