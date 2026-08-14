import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { logAdminAction } from "../admin/audit-log";

/**
 * Which real email address/domain each RTA sends its mail from — used to
 * be a hardcoded constant (mail-link-extraction.ts's SENDER_DOMAINS),
 * requiring a code change + deploy if CAMS or KFintech ever changed their
 * sending address. Now editable from Super Admin; mail-ingestion.processor.ts
 * reads this table fresh each poll cycle instead.
 */
@Injectable()
export class RtaConfigService {
  async list() {
    return prisma.rtaSenderConfig.findMany({ orderBy: { rtaType: "asc" } });
  }

  async update(rtaType: string, senderIdentifier: string) {
    const trimmed = senderIdentifier.trim().toLowerCase();
    if (!trimmed) {
      throw new NotFoundException("Sender identifier cannot be empty");
    }
    const updated = await prisma.rtaSenderConfig.upsert({
      where: { rtaType },
      create: { rtaType, senderIdentifier: trimmed },
      update: { senderIdentifier: trimmed },
    });
    await logAdminAction("RTA_SENDER_CONFIG_UPDATE", undefined, { rtaType, senderIdentifier: trimmed });
    return updated;
  }
}
