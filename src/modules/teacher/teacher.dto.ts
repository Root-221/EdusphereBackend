import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListTeacherClassesQueryDto {
  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 'cmbx123sem01' })
  @IsOptional()
  @IsString()
  semesterId?: string;

  @ApiPropertyOptional({ example: 'cmbx123subject01' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class ListTeacherTimetableQueryDto {
  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 'cmbx123sem01' })
  @IsOptional()
  @IsString()
  semesterId?: string;

  @ApiPropertyOptional({ example: 'cmbx123class01' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: '2026-04-13' })
  @IsOptional()
  @IsString()
  weekStartDate?: string;
}

export class CancelTeacherCourseDto {
  @ApiProperty({ example: 'cours annulé pour raison médicale' })
  @IsOptional()
  @IsString()
  reason?: string;
}
