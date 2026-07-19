export type RtaSender = "CAMS" | "KFINTECH";

const SENDER_DOMAINS: Record<RtaSender, string> = {
  CAMS: "camsonline.com",
  KFINTECH: "kfintech.com",
};

const LINK_PATTERNS: Record<RtaSender, RegExp> = {
  CAMS: /https:\/\/([a-zA-Z0-9.-]+\.)?camsonline\.com\/[^\s"'<>]+/gi,
  KFINTECH: /https:\/\/([a-zA-Z0-9.-]+\.)?kfintech\.com\/[^\s"'<>]+/gi,
};

/** Identifies which RTA sent an email, from its From: address. Returns null for anything else — mail-ingestion should skip those. */
export function identifyRtaSender(fromAddress: string): RtaSender | null {
  const lower = fromAddress.toLowerCase();
  for (const [rta, domain] of Object.entries(SENDER_DOMAINS) as [RtaSender, string][]) {
    if (lower.includes(domain)) {
      return rta;
    }
  }
  return null;
}

/** Extracts the first RTA secure-download link from the email body (checks both text and HTML forms — a link may only appear inside an href). */
export function extractDownloadLink(rta: RtaSender, bodyText: string, bodyHtml?: string): string | null {
  const pattern = LINK_PATTERNS[rta];
  const fromText = bodyText.match(pattern)?.[0];
  if (fromText) {
    return fromText;
  }
  if (bodyHtml) {
    pattern.lastIndex = 0;
    return bodyHtml.match(pattern)?.[0] ?? null;
  }
  return null;
}
