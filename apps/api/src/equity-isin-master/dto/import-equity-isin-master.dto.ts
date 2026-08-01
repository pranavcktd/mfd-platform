import { IsString } from "class-validator";

export class ImportEquityIsinMasterDto {
  @IsString()
  folderPath!: string;
}
