import { BadRequestException, Body, Controller, Delete, Get, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ImportExternalService } from "./import-external.service";

@Controller("import-external")
export class ImportExternalController {
  constructor(private readonly importExternalService: ImportExternalService) {}

  @Post("cas/preview")
  @UseInterceptors(FileInterceptor("file"))
  previewCas(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("password") password: string,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!password) {
      throw new BadRequestException("This statement's password is required");
    }
    return this.importExternalService.previewCas(file.buffer, password);
  }

  @Post("cas")
  @UseInterceptors(FileInterceptor("file"))
  importCas(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("password") password: string,
    @Body("selectedKeys") selectedKeys?: string,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!password) {
      throw new BadRequestException("This statement's password is required");
    }
    // selectedKeys arrives as a JSON-stringified array (multipart/form-data
    // has no native array field type) — falls back to "import everything"
    // if the client omits it, matching the pre-preview behavior.
    const keys: string[] | undefined = selectedKeys ? JSON.parse(selectedKeys) : undefined;
    return this.importExternalService.importCas(file.buffer, password, keys);
  }

  @Get("cas/summary")
  getCasDataSummary() {
    return this.importExternalService.getCasDataSummary();
  }

  @Delete("cas")
  deleteCasData(@Body() body: { folioIds: string[] }) {
    if (!body?.folioIds?.length) {
      throw new BadRequestException("folioIds is required");
    }
    return this.importExternalService.deleteCasData(body.folioIds);
  }
}
