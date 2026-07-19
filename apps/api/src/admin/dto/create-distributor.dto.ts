import { Type } from "class-transformer";
import { IsEmail, IsObject, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

export class CreateArnProfileDto {
  @IsString()
  arnNumber!: string;

  @IsString()
  arnHolderName!: string;

  @IsOptional()
  @IsString()
  euinNumber?: string;

  // PAN/displayName/email/phone are marked "*" on the onboarding form, but
  // per the actual business requirement that means NOT mandatory (opposite
  // of the usual asterisk convention) — child ARN onboarding routinely
  // omits all four.
  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsEmail()
  camsMailId?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;
}

export class CreateDistributorDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CreateArnProfileDto)
  arnProfile!: CreateArnProfileDto;
}
