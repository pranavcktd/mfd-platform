import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { OtherAssetsService } from "./other-assets.service";
import { CreateOtherAssetDto } from "./dto/create-other-asset.dto";
import { UpdateOtherAssetDto } from "./dto/update-other-asset.dto";

@Controller("other-assets")
export class OtherAssetsController {
  constructor(private readonly otherAssetsService: OtherAssetsService) {}

  @Get()
  list(@Query("clientId") clientId?: string) {
    return this.otherAssetsService.list(clientId);
  }

  @Post()
  create(@Body() dto: CreateOtherAssetDto) {
    return this.otherAssetsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOtherAssetDto) {
    return this.otherAssetsService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string) {
    return this.otherAssetsService.remove(id);
  }
}
