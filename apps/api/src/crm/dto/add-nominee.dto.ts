import { IsOptional, IsString } from "class-validator";

export class AddNomineeDto {
  @IsString()
  nomineeName!: string;

  @IsOptional()
  @IsString()
  relation?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  mobile?: string;
}
