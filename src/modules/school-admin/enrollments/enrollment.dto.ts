import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const EnrollmentPeriodTypeValues = {
  new: 'new',
  re_enrollment: 're_enrollment',
} as const;

export type EnrollmentPeriodType =
  (typeof EnrollmentPeriodTypeValues)[keyof typeof EnrollmentPeriodTypeValues];

export const EnrollmentStatusValues = {
  draft: 'draft',
  pending_payment: 'pending_payment',
  paid: 'paid',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export type EnrollmentStatus =
  (typeof EnrollmentStatusValues)[keyof typeof EnrollmentStatusValues];

export const PaymentMethodValues = {
  cash: 'cash',
  wave: 'wave',
  orange_money: 'orange_money',
  transfer: 'transfer',
} as const;

export type PaymentMethod = (typeof PaymentMethodValues)[keyof typeof PaymentMethodValues];

export class CreateEnrollmentPeriodDto {
  @ApiProperty({ example: 'Inscription 2025-2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: EnrollmentPeriodTypeValues })
  @IsEnum(EnrollmentPeriodTypeValues)
  type: EnrollmentPeriodType;

  @ApiPropertyOptional({
    example: 'cmbx123ay01',
    description: "Optionnel. Si absent, l'année scolaire active est utilisée automatiquement.",
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiProperty({ example: '2025-03-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-09-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 200, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEnrollments?: number;

  @ApiPropertyOptional({ example: 'Période principale pour la rentrée.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEnrollmentPeriodDto extends PartialType(CreateEnrollmentPeriodDto) {}

export class SetActiveEnrollmentPeriodDto {
  @ApiProperty({ example: 'cmbx123period01' })
  @IsString()
  @IsNotEmpty()
  periodId: string;
}

export class ListEnrollmentsQueryDto {
  @ApiPropertyOptional({ example: 'cmbx123period01' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({ enum: EnrollmentPeriodTypeValues })
  @IsOptional()
  @IsEnum(EnrollmentPeriodTypeValues)
  type?: EnrollmentPeriodType;

  @ApiPropertyOptional({ enum: EnrollmentStatusValues })
  @IsOptional()
  @IsEnum(EnrollmentStatusValues)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ example: 'cmbx123ay01' })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: 'cmbx123class01' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: 'cmbx123level01' })
  @IsOptional()
  @IsString()
  levelId?: string;

  @ApiPropertyOptional({ example: 'moussa' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreateEnrollmentDto {
  @ApiPropertyOptional({ example: 'cmbx123period01' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiProperty({ example: 'cmbx123class01' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'Moussa' })
  @IsString()
  @IsNotEmpty()
  studentFirstName: string;

  @ApiProperty({ example: 'Diop' })
  @IsString()
  @IsNotEmpty()
  studentLastName: string;

  @ApiProperty({ example: 'moussa.diop@email.sn' })
  @IsEmail()
  studentEmail: string;

  @ApiPropertyOptional({ example: '+221 77 000 00 00' })
  @IsOptional()
  @IsString()
  studentPhone?: string;

  @ApiPropertyOptional({ example: '2013-05-10' })
  @IsOptional()
  @IsDateString()
  studentDateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  studentGender?: string;

  @ApiPropertyOptional({ example: 'Dakar, Plateau' })
  @IsOptional()
  @IsString()
  studentAddress?: string;

  @ApiPropertyOptional({ example: 'CEM Birane' })
  @IsOptional()
  @IsString()
  studentPreviousSchool?: string;

  @ApiProperty({ example: 'Awa' })
  @IsString()
  @IsNotEmpty()
  parentFirstName: string;

  @ApiProperty({ example: 'Sow' })
  @IsString()
  @IsNotEmpty()
  parentLastName: string;

  @ApiProperty({ example: 'awa.sow@email.sn' })
  @IsEmail()
  parentEmail: string;

  @ApiPropertyOptional({ example: '+221 77 111 22 33' })
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiPropertyOptional({ example: 'Ingénieure' })
  @IsOptional()
  @IsString()
  parentProfession?: string;

  @ApiPropertyOptional({ example: 'Dakar, Mermoz' })
  @IsOptional()
  @IsString()
  parentAddress?: string;

  @ApiPropertyOptional({ example: 'cash', enum: PaymentMethodValues })
  @IsOptional()
  @IsEnum(PaymentMethodValues)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 260000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentAmount?: number;

  @ApiPropertyOptional({ example: ['s1', 's2'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  selectedSubjects?: string[];

  @ApiPropertyOptional({ example: 'Dossier complet et paiement immédiat.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateReEnrollmentDto {
  @ApiPropertyOptional({ example: 'cmbx123period02' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiProperty({ example: 'SCH-2026-0001' })
  @IsString()
  @MinLength(3)
  matricule: string;

  @ApiProperty({ example: 'cmbx123class02' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: 'cash', enum: PaymentMethodValues })
  @IsOptional()
  @IsEnum(PaymentMethodValues)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 150000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentAmount?: number;

  @ApiPropertyOptional({ example: 'Réinscription confirmée après validation.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
