import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { RoomStatusEnum, RoomTypeEnum, type RoomStatus, type RoomType } from '../infrastructure.types';

export class CreateRoomDto {
  @ApiProperty({ example: 'Salle A101' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'cmbx123room01', description: 'Identifiant du bâtiment parent' })
  @IsString()
  @IsNotEmpty()
  buildingId: string;

  @ApiPropertyOptional({ example: 1, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional({ example: 30, minimum: 1, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiProperty({ enum: RoomTypeEnum })
  @IsEnum(RoomTypeEnum)
  roomType: RoomType;

  @ApiPropertyOptional({ enum: RoomStatusEnum, default: RoomStatusEnum.active })
  @IsOptional()
  @IsEnum(RoomStatusEnum)
  status?: RoomStatus;

  @ApiPropertyOptional({ example: 'Salle équipée de projecteur.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Tableaux, vidéoprojecteur, chaises' })
  @IsOptional()
  @IsString()
  equipment?: string;
}
