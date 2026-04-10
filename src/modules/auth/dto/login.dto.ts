import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ 
    example: 'admin@school.com', 
    description: "Email de l'utilisateur" 
  })
  @IsEmail({}, { message: 'L\'email fourni n\'est pas valide' })
  @IsNotEmpty({ message: 'L\'email est obligatoire' })
  email: string;

  @ApiProperty({ 
    example: 'Password123!', 
    description: 'Mot de passe (min 8 caracteres)' 
  })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  password: string;
}

