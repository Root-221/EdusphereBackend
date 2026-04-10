import { IsBoolean } from 'class-validator';

export class UpdateSchoolAdminStatusDto {
  @IsBoolean()
  isActive: boolean;
}
