import { IsString, MinLength } from "class-validator";

export class ClientChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
