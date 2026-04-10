import { IsEmail, IsString, IsNotEmpty, Length, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCHOOL_TYPES, SchoolType } from '@common/constants/school-types';

export class RegisterSchoolDto {
  @ApiProperty({ example: 'Lycée Moderne', description: "Nom de l'ecole" })
  @IsString({ message: 'Le nom de l\'école doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom de l\'école est obligatoire' })
  name: string;

  @ApiProperty({ example: 'lycee-moderne', description: "Slug unique de l'ecole (3-50 chars)" })
  @IsString({ message: 'Le slug doit être une chaîne de caractères' })
  @Length(3, 50, { message: 'Le slug doit contenir entre 3 et 50 caractères' })
  @IsNotEmpty({ message: 'Le slug est obligatoire' })
  slug: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'PRIVATE', enum: SCHOOL_TYPES })
  @IsIn(SCHOOL_TYPES, { message: "Le type d'école n'est pas valide" })
  type?: SchoolType;

  @IsOptional()
  @ApiPropertyOptional({ example: 'free' })
  @IsString()
  plan?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'contact@lycee-moderne.com', description: 'Email de contact école' })
  @IsEmail({}, { message: 'L\'email de contact n\'est pas valide' })
  contactEmail?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'admin@lycee-moderne.com', description: 'Email admin école' })
  @IsEmail({}, { message: 'L\'email renseigné n\'est pas valide' })
  email?: string;

  @ApiProperty({ example: 'Admin' })
  @IsString({ message: 'Le prénom de l\'admin doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le prénom de l\'admin est obligatoire' })
  adminFirstName: string;

  @ApiProperty({ example: 'Diop' })
  @IsString({ message: 'Le nom de l\'admin doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom de l\'admin est obligatoire' })
  adminLastName: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '+221 77 123 45 67' })
  @IsString()
  adminPhone?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'Dakar' })
  @IsString()
  city?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'Sénégal' })
  @IsString()
  country?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'Avenue Cheikh Anta Diop' })
  @IsString()
  address?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'Une école tournée vers l’excellence.' })
  @IsString()
  description?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/.../logo.png' })
  @IsString()
  logo?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsString()
  brandingColor?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '#10b981' })
  @IsString()
  brandingSecondaryColor?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'Excellence académique pour tous' })
  @IsString()
  brandingSlogan?: string;

}
