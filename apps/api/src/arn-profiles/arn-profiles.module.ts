import { Module } from "@nestjs/common";
import { ArnProfilesController } from "./arn-profiles.controller";
import { ArnProfilesService } from "./arn-profiles.service";

@Module({
  controllers: [ArnProfilesController],
  providers: [ArnProfilesService],
})
export class ArnProfilesModule {}
