import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { CreateOtherAssetDto } from "./dto/create-other-asset.dto";
import { UpdateOtherAssetDto } from "./dto/update-other-asset.dto";

@Injectable()
export class OtherAssetsService {
  async list(clientId: string | undefined) {
    const distributorId = TenantContext.currentDistributorId();
    const assets = await prisma.otherAsset.findMany({
      where: { distributorId, ...(clientId ? { clientId } : {}) },
      orderBy: { asOfDate: "desc" },
      include: { client: { select: { name: true } } },
    });
    return assets.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      clientName: a.client.name,
      assetType: a.assetType,
      description: a.description,
      value: a.value.toString(),
      asOfDate: a.asOfDate,
      details: a.details,
    }));
  }

  async create(dto: CreateOtherAssetDto) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findUnique({ where: { id: dto.clientId }, select: { distributorId: true } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    if (client.distributorId !== distributorId) {
      throw new ForbiddenException("Client does not belong to this distributor");
    }

    const details = await this.resolveDetails(dto.assetType, dto.details);

    const asset = await prisma.otherAsset.create({
      data: {
        distributorId,
        clientId: dto.clientId,
        assetType: dto.assetType,
        description: dto.description,
        value: dto.value,
        asOfDate: new Date(dto.asOfDate),
        details: details as Prisma.InputJsonValue,
      },
    });
    return { id: asset.id };
  }

  /**
   * EQUITY_SHARES is the one asset type with server-side enrichment: the
   * frontend selects a stock from the real global EquityIsinMaster
   * (2026-07-24, seeded from admin-imported NSE+BSE listed-equity files —
   * see equity-isin-master module) and sends its ISIN; this looks the
   * canonical company name/symbols back up so the stored details don't
   * silently drift from the master if the frontend only sent a partial
   * record. If the ISIN isn't found (e.g. a very recent listing not yet in
   * an imported master), the details still pass through as given rather
   * than blocking the entry — better to record what the MFD typed than to
   * refuse the whole asset over a stale reference list.
   */
  private async resolveDetails(
    assetType: string,
    details: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown> | undefined> {
    if (assetType !== "EQUITY_SHARES" || !details) {
      return details;
    }
    const isin = typeof details.isin === "string" && details.isin.trim() ? details.isin.trim().toUpperCase() : undefined;
    if (!isin) {
      return details;
    }
    const stock = await prisma.equityIsinMaster.findUnique({ where: { isin } });
    if (!stock) {
      return details;
    }
    return {
      ...details,
      isin: stock.isin,
      stockName: stock.companyName,
      nseSymbol: stock.nseSymbol,
      bseScripCode: stock.bseScripCode,
    };
  }

  async update(id: string, dto: UpdateOtherAssetDto) {
    const distributorId = TenantContext.currentDistributorId();
    const existing = await prisma.otherAsset.findUnique({ where: { id }, select: { distributorId: true, assetType: true } });
    if (!existing || existing.distributorId !== distributorId) {
      throw new NotFoundException("Asset not found");
    }

    const details = await this.resolveDetails(existing.assetType, dto.details);

    const asset = await prisma.otherAsset.update({
      where: { id },
      data: {
        description: dto.description,
        value: dto.value,
        asOfDate: new Date(dto.asOfDate),
        details: details as Prisma.InputJsonValue,
      },
    });
    return { id: asset.id };
  }

  async remove(id: string) {
    const distributorId = TenantContext.currentDistributorId();
    const asset = await prisma.otherAsset.findUnique({ where: { id }, select: { distributorId: true } });
    if (!asset || asset.distributorId !== distributorId) {
      throw new NotFoundException("Asset not found");
    }
    await prisma.otherAsset.delete({ where: { id } });
  }
}
