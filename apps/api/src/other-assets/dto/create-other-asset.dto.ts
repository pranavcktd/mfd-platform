import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateOtherAssetDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  assetType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsDateString()
  asOfDate!: string;
}
