import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'NouveauMotDePasse123!',
    minLength: 8,
    description: 'Nouveau mot de passe du compte',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;

  @ApiPropertyOptional({
    example: 'Password123!',
    description: 'Mot de passe actuel si l’utilisateur le connaît',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  currentPassword?: string;
}
