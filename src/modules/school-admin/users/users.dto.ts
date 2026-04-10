import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const StaffRoleValues = {
  secretary: 'secretary',
  accountant: 'accountant',
  librarian: 'librarian',
  it_support: 'it_support',
  pedagogical_counselor: 'pedagogical_counselor',
  administrative_assistant: 'administrative_assistant',
  studies_director: 'studies_director',
  bursar: 'bursar',
} as const;

export type StaffRoleKey = (typeof StaffRoleValues)[keyof typeof StaffRoleValues];

export class CreateTeacherDto {
  @ApiProperty({ example: 'Mamadou' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Diop' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'm.diop@ecole.sn' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+221 77 123 45 67' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'cmbx123subject01' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {}

export class CreateStudentDto {
  @ApiProperty({ example: 'Oumar' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Fall' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'oumar.fall@eleve.sn' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+221 77 111 22 33' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'cmbx123class01' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '2025-2026' })
  @IsOptional()
  @IsString()
  enrollmentYear?: string;

  @ApiPropertyOptional({
    example: 'cmbx123ay01',
    description: "Optionnel. Si absent, l'année active est utilisée.",
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 14.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  average?: number;

  @ApiPropertyOptional({ example: '2025-04-20' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'Dakar, Plateau' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mariama Fall' })
  @IsOptional()
  @IsString()
  parentName?: string;

  @ApiPropertyOptional({ example: '+221 77 333 44 55' })
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class ListStudentsQueryDto {
  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;
}

export class CreateParentDto {
  @ApiProperty({ example: 'Mariama' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Diop' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'mariama.diop@email.sn' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+221 77 111 22 33' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ example: 'cmbx123class01' })
  @IsOptional()
  @IsString()
  childClassId?: string;

  @ApiPropertyOptional({ example: 'Ingénieure' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateParentDto extends PartialType(CreateParentDto) {}

export class CreateStaffDto {
  @ApiProperty({ example: 'Moussa' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Sarr' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'm.sarr@ecole.sn' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+221 77 111 22 33' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: StaffRoleValues })
  @IsString()
  @IsIn(Object.values(StaffRoleValues))
  roleId: StaffRoleKey;

  @ApiPropertyOptional({ example: 'Administration' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: '2024-09-01' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}
