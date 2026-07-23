import { Module } from "@nestjs/common";
import { OtherAssetsController } from "./other-assets.controller";
import { OtherAssetsService } from "./other-assets.service";

@Module({
  controllers: [OtherAssetsController],
  providers: [OtherAssetsService],
})
export class OtherAssetsModule {}
