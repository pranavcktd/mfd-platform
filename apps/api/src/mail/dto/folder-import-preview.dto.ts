import { IsString } from "class-validator";

export class FolderImportPreviewDto {
  /** Server-local folder path to walk — same convention as FolderImportDto's folderPath, just read-only. */
  @IsString()
  folderPath!: string;
}
