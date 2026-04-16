import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AttendanceMethod {
  QR_CODE = 'QR_CODE',
  MANUAL = 'MANUAL',
}

export class MarkAttendanceDto {
  @ApiProperty({ description: 'ID de l\'instance de cours' })
  @IsString()
  @IsNotEmpty()
  courseInstanceId: string;

  @ApiProperty({ description: 'ID de l\'élève ou Token QR' })
  @IsString()
  @IsNotEmpty()
  studentIdOrToken: string;

  @ApiProperty({ enum: AttendanceMethod, default: AttendanceMethod.QR_CODE })
  @IsEnum(AttendanceMethod)
  method: AttendanceMethod;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ManualAttendanceDto {
  @ApiProperty({ description: 'ID de l\'instance de cours' })
  @IsString()
  @IsNotEmpty()
  courseInstanceId: string;

  @ApiProperty({ description: 'Matricule de l\'élève' })
  @IsString()
  @IsNotEmpty()
  matricule: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class JustifyAttendanceDto {
  @ApiProperty({ description: 'Motif de la justification' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
