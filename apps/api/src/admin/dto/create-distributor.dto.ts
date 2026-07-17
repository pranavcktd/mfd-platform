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

  @IsString()
  panNumber!: string;

  @IsString()
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

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
