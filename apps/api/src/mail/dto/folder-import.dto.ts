import { IsOptional, IsString } from "class-validator";

export class FolderImportDto {
  @IsString()
  distributorId!: string;

  @IsOptional()
  @IsString()
  arnProfileId?: string;

  /** Server-local folder path to walk — same convention as the existing "basic data/" folder, not a browser file upload. */
  @IsString()
  folderPath!: string;

  /** One-off zip password for THIS import only, if the historical archive's password differs from the MFD's current live-mail credential — never overwrites the stored credential. */
  @IsOptional()
  @IsString()
  camsZipPassword?: string;

  @IsOptional()
  @IsString()
  kfintechZipPassword?: string;
}
