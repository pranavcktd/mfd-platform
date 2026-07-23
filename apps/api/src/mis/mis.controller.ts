import { Controller, Get } from "@nestjs/common";
import { MisService } from "./mis.service";

@Controller("mis")
export class MisController {
  constructor(private readonly misService: MisService) {}

  @Get("summary")
  getSummary() {
    return this.misService.getSummary();
  }
}
