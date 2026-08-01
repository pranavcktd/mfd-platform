import { IsDateString, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min } from "class-validator";

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

  /**
   * Type-specific fields, shape depends on assetType — see
   * OtherAssetsService.buildDetailsAndValue. Nest's ValidationPipe has
   * `whitelist: true`, which strips any body property not declared on the
   * DTO, so this must be declared here even though its inner shape isn't
   * itself validated field-by-field.
   */
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
