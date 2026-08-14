import { prisma } from "@mfd/db";
import { DEFAULT_SENDER_DOMAINS, type RtaSender } from "./mail-link-extraction";

/**
 * Live, editable-in-Super-Admin sender-identification values (see
 * apps/api/src/rta-config/rta-config.service.ts) — fetched once per
 * mail-ingestion poll cycle, not per message, since it rarely changes and
 * a poll can scan hundreds of messages. Falls back to the hardcoded
 * defaults per-RTA if that RTA's row is somehow missing (table not
 * seeded, or cleared) — never silently breaks mail ingestion.
 */
export async function loadRtaSenderDomains(): Promise<Record<RtaSender, string>> {
  const rows = await prisma.rtaSenderConfig.findMany();
  const map: Record<RtaSender, string> = { ...DEFAULT_SENDER_DOMAINS };
  for (const r of rows) {
    if (r.rtaType === "CAMS" || r.rtaType === "KFINTECH") {
      map[r.rtaType] = r.senderIdentifier;
    }
  }
  return map;
}
