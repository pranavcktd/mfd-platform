import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { DataQualityService, GapType } from "./data-quality.service";

@UseGuards(AdminGuard)
@Controller("admin/data-quality")
export class DataQualityController {
  constructor(private readonly dataQualityService: DataQualityService) {}

  @Get("summary")
  getSummary(@Query("distributorId") distributorId?: string) {
    return this.dataQualityService.getSummary(distributorId);
  }

  @Get("folios")
  listGaps(@Query("gapType") gapType: GapType, @Query("distributorId") distributorId?: string) {
    return this.dataQualityService.listGaps(gapType, distributorId);
  }

  @Get("folios/:id/suggestions")
  getSuggestions(@Param("id") id: string) {
    return this.dataQualityService.getSuggestions(id);
  }

  @Patch("folios/:id")
  applyCorrection(@Param("id") id: string, @Body() body: { isin?: string; assetClass?: string; rtaType?: string }) {
    return this.dataQualityService.applyCorrection(id, body);
  }

  @Post("folios/bulk-apply")
  bulkApply(@Body() body: { folioIds: string[]; isin?: string; assetClass?: string; rtaType?: string }) {
    const { folioIds, ...fields } = body;
    return this.dataQualityService.bulkApply(folioIds, fields);
  }
}
