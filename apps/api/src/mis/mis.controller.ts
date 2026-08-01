import { Controller, Get, Param, Query } from "@nestjs/common";
import { MisService, MisCheck } from "./mis.service";

@Controller("mis")
export class MisController {
  constructor(private readonly misService: MisService) {}

  @Get("counts")
  getCounts(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.misService.getCounts(arnProfileIds ? arnProfileIds.split(",").filter(Boolean) : undefined);
  }

  @Get(":check")
  getCheck(
    @Param("check") check: MisCheck,
    @Query("page") page?: string,
    @Query("search") search?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.misService.getCheck(
      check,
      page ? Number(page) : 1,
      search,
      arnProfileIds ? arnProfileIds.split(",").filter(Boolean) : undefined,
    );
  }
}
