import { IsOptional, IsString } from "class-validator";

export class AddBankAccountDto {
  @IsString()
  bankName!: string;

  @IsString()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsString()
  branchName?: string;
}
