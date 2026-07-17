import { IsEnum, IsObject } from "class-validator";
import { ExternalProvider } from "@mfd/db";

export class SaveCredentialDto {
  @IsEnum(ExternalProvider)
  provider!: ExternalProvider;

  @IsObject()
  payload!: Record<string, string>;
}
