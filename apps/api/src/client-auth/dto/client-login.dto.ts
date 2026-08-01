import { IsString, MinLength } from "class-validator";

export class ClientLoginDto {
  @IsString()
  panNumber!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
