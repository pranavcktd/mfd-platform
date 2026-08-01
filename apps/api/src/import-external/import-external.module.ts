import { Module } from "@nestjs/common";
import { ImportExternalController } from "./import-external.controller";
import { ImportExternalService } from "./import-external.service";

@Module({
  controllers: [ImportExternalController],
  providers: [ImportExternalService],
})
export class ImportExternalModule {}
