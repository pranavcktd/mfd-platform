import { Module } from "@nestjs/common";
import { MailController } from "./mail.controller";
import { MailService } from "./mail.service";
import { AdminGuard } from "../admin/admin.guard";

@Module({
  controllers: [MailController],
  providers: [MailService, AdminGuard],
})
export class MailModule {}
