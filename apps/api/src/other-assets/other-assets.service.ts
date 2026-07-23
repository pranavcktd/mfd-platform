import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { CreateOtherAssetDto } from "./dto/create-other-asset.dto";

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

    const asset = await prisma.otherAsset.create({
      data: {
        distributorId,
        clientId: dto.clientId,
        assetType: dto.assetType,
        description: dto.description,
        value: dto.value,
        asOfDate: new Date(dto.asOfDate),
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
