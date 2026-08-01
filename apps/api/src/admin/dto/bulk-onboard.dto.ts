import { IsString } from "class-validator";

/** Raw CSV text rather than a multipart file upload — keeps the request a plain JSON body, no multer/file-type wiring needed. */
export class BulkOnboardDto {
  @IsString()
  csvText!: string;
}
