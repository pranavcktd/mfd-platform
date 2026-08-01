import { IsDateString, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";

export class UpdateOtherAssetDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsDateString()
  asOfDate!: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
