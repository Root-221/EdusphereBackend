import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const AcademicYearStatusValues = {
  draft: 'draft',
  active: 'active',
  completed: 'completed',
} as const;

export type AcademicYearStatus =
  (typeof AcademicYearStatusValues)[keyof typeof AcademicYearStatusValues];

export const SemesterStatusValues = {
  active: 'active',
  completed: 'completed',
  locked: 'locked',
} as const;

export type SemesterStatus =
  (typeof SemesterStatusValues)[keyof typeof SemesterStatusValues];

export const ClassStatusValues = {
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
} as const;

export type ClassStatus = (typeof ClassStatusValues)[keyof typeof ClassStatusValues];

export const LevelStatusValues = {
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
} as const;

export type LevelStatus = (typeof LevelStatusValues)[keyof typeof LevelStatusValues];

export const SubjectStatusValues = {
  active: 'active',
  inactive: 'inactive',
} as const;

export type SubjectStatus = (typeof SubjectStatusValues)[keyof typeof SubjectStatusValues];

export const TimetableStatusValues = {
  active: 'active',
  inactive: 'inactive',
  draft: 'draft',
} as const;

export type TimetableStatus =
  (typeof TimetableStatusValues)[keyof typeof TimetableStatusValues];

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2025-2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2025-09-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-15' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: AcademicYearStatusValues, default: AcademicYearStatusValues.draft })
  @IsOptional()
  @IsEnum(AcademicYearStatusValues)
  status?: AcademicYearStatus;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class UpdateAcademicYearStatusDto {
  @ApiProperty({ enum: AcademicYearStatusValues })
  @IsEnum(AcademicYearStatusValues)
  status: AcademicYearStatus;
}

export class ListSemestersQueryDto {
  @ApiPropertyOptional({
    example: 'cmbx123ay01',
    description: "Optionnel. Si absent, l'année active est utilisée.",
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ enum: SemesterStatusValues })
  @IsOptional()
  @IsEnum(SemesterStatusValues)
  status?: SemesterStatus;
}

export class ListClassesQueryDto {
  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 'cmbx123level01', description: 'Filtrer les classes par niveau' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ example: 'cmbx123level01', description: 'Alias du filtre niveau' })
  @IsOptional()
  @IsString()
  levelId?: string;

  @ApiPropertyOptional({ enum: ClassStatusValues })
  @IsOptional()
  @IsEnum(ClassStatusValues)
  status?: ClassStatus;
}

export class ListTimetablesQueryDto {
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

  @ApiPropertyOptional({ enum: TimetableStatusValues })
  @IsOptional()
  @IsEnum(TimetableStatusValues)
  status?: TimetableStatus;
}

export class CreateSemesterDto {
  @ApiPropertyOptional({
    example: 'cmbx123ay01',
    description: "Optionnel. Si absent, l'année active est utilisée.",
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiProperty({ example: 'Semestre 1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2025-09-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-12-20' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: SemesterStatusValues, default: SemesterStatusValues.active })
  @IsOptional()
  @IsEnum(SemesterStatusValues)
  status?: SemesterStatus;
}

export class UpdateSemesterDto extends PartialType(CreateSemesterDto) {}

export class UpdateSemesterStatusDto {
  @ApiProperty({ enum: SemesterStatusValues })
  @IsEnum(SemesterStatusValues)
  status: SemesterStatus;
}

export class ListLevelsQueryDto {
  @ApiPropertyOptional({ enum: LevelStatusValues })
  @IsOptional()
  @IsEnum(LevelStatusValues)
  status?: LevelStatus;
}

export class CreateLevelDto {
  @ApiProperty({ example: 'Terminale' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 3, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 'Niveaux de fin de cycle.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LevelStatusValues, default: LevelStatusValues.active })
  @IsOptional()
  @IsEnum(LevelStatusValues)
  status?: LevelStatus;
}

export class UpdateLevelDto extends PartialType(CreateLevelDto) {}

export class CreateClassDto {
  @ApiProperty({ example: 'Terminale S1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'cmbx123level01', description: 'Niveau obligatoire de la classe' })
  @IsString()
  @IsNotEmpty()
  levelId: string;

  @ApiPropertyOptional({ example: 40, minimum: 1, default: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 'cmbx123teacher01', description: 'Enseignant principal' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ enum: ClassStatusValues, default: ClassStatusValues.active })
  @IsOptional()
  @IsEnum(ClassStatusValues)
  status?: ClassStatus;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

export class AssignClassSubjectsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  subjectIds: string[];
}

export class CreateSubjectDto {
  @ApiProperty({ example: 'Mathématiques' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'MAT' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 4, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  coefficient?: number;

  @ApiPropertyOptional({ example: 6, minimum: 1, default: 1, description: 'Volume horaire hebdomadaire' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hours?: number;

  @ApiPropertyOptional({ enum: SubjectStatusValues, default: SubjectStatusValues.active })
  @IsOptional()
  @IsEnum(SubjectStatusValues)
  status?: SubjectStatus;

  @ApiPropertyOptional({ example: 'Cours de mathématiques de niveau secondaire.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

export class AssignSubjectTeachersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  teacherIds: string[];
}

export class CreateTimeSlotDto {
  @ApiProperty({ example: '1er créneau' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @IsNotEmpty()
  endTime: string;
}

export class UpdateTimeSlotDto extends PartialType(CreateTimeSlotDto) {}

export class CreateTimetableDto {
  @ApiPropertyOptional({
    example: 'cmbx123ay01',
    description: "Optionnel. Si absent, il est déduit du semestre en cours.",
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({
    example: 'cmbx123sem01',
    description: "Optionnel. Si absent, le semestre en cours est utilisé.",
  })
  @IsOptional()
  @IsString()
  semesterId?: string;

  @ApiProperty({ example: 'cmbx123class01' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ enum: TimetableStatusValues, default: TimetableStatusValues.active })
  @IsOptional()
  @IsEnum(TimetableStatusValues)
  status?: TimetableStatus;
}

export class UpdateTimetableDto extends PartialType(CreateTimetableDto) {}

export class DuplicateTimetableDto {
  @ApiProperty({ example: 'cmbx123sem02' })
  @IsString()
  @IsNotEmpty()
  targetSemesterId: string;
}

export class CreateTimetableEntryDto {
  @ApiProperty({ example: 'Lundi' })
  @IsString()
  @IsNotEmpty()
  day: string;

  @ApiProperty({ example: 'cmbx123ts01' })
  @IsString()
  @IsNotEmpty()
  timeSlotId: string;

  @ApiProperty({ example: 'cmbx123subject01' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 'cmbx123teacher01' })
  @IsString()
  @IsNotEmpty()
  teacherId: string;

  @ApiProperty({ example: 'cmbx123class01' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: 'Salle A101' })
  @IsOptional()
  @IsString()
  room?: string;
}

export class UpdateTimetableEntryDto extends PartialType(CreateTimetableEntryDto) {}
