import { IsString, MinLength } from "class-validator";

export class AdminChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
