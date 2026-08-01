import { Controller, Get, Query } from "@nestjs/common";
import { AnalysisService, type MonthlyVolumeType } from "./analysis.service";

const VALID_VOLUME_TYPES: MonthlyVolumeType[] = ["purchase", "redemption", "other", "all"];

@Controller("analysis")
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get("summary")
  getSummary(@Query("arnProfileIds") arnProfileIds?: string) {
    const ids = arnProfileIds ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
    return this.analysisService.getSummary(ids);
  }

  @Get("monthly-volume")
  getMonthlyVolume(@Query("months") monthsRaw?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    const months = Number(monthsRaw) || 12;
    const ids = arnProfileIds ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
    return this.analysisService.getMonthlyVolume(months, ids);
  }

  @Get("monthly-volume/drilldown")
  getMonthlyVolumeDrilldown(
    @Query("month") month: string,
    @Query("type") type?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    const ids = arnProfileIds ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
    const safeType: MonthlyVolumeType = VALID_VOLUME_TYPES.includes(type as MonthlyVolumeType) ? (type as MonthlyVolumeType) : "all";
    return this.analysisService.getMonthlyVolumeDrilldown(month, safeType, ids);
  }
}
