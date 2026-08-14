export type RtaSender = "CAMS" | "KFINTECH";

/**
 * Fallback only — the real, live values come from the rta_sender_config
 * table (editable in Super Admin, see rta-config.service.ts) so a future
 * CAMS/KFintech sending-address change doesn't need a code change +
 * deploy. Used here only if the DB table is somehow empty/unreachable.
 */
export const DEFAULT_SENDER_DOMAINS: Record<RtaSender, string> = {
  CAMS: "camsonline.com",
  KFINTECH: "kfintech.com",
};

/**
 * Deliberately narrow, confirmed against real inbox mail — not just "any
 * link on the RTA's domain":
 *  - CAMS: a generic "NAV Applicability" info-page link
 *    (www.camsonline.com/Investors/...) appears in the footer of EVERY
 *    CAMS mailback email, including "no data" ones. The real report link
 *    is always on a "mailbackNN.camsonline.com/mailback_result/" host —
 *    matching that specifically means a "no data" email (which genuinely
 *    has no such link, confirmed via its "DownloadURL NA" / "Request
 *    Status No Data" body text) naturally yields no match, with no need
 *    for separate no-data text detection.
 *  - KFintech: the HTML body's FIRST kfintech.com link is a plain
 *    reference to the mfs.kfintech.com portal (e.g. "on mfs.kfintech.com.
 *    Click Here to download") — matching that would grab the wrong link
 *    entirely. The actual download is always a
 *    "scdelivery.kfintech.com/c/?u=...&p=..." click-tracking redirect
 *    (Salesforce Marketing Cloud), which resolves to the real file when
 *    fetched — matching that host specifically avoids the portal link.
 */
const LINK_PATTERNS: Record<RtaSender, RegExp> = {
  CAMS: /https:\/\/mailback\d*\.camsonline\.com\/mailback_result\/[^\s"'<>\]]+/gi,
  KFINTECH: /https:\/\/scdelivery\.kfintech\.com\/c\/[^\s"'<>\]]+/gi,
};

/**
 * Which body part to check first, per RTA — confirmed against real mail,
 * not assumed: CAMS's plain-text body has the real DownloadURL directly
 * and reliably. KFintech's plain-text body is broken — its tracking-link
 * parameter renders as the literal string "undefined" in the text
 * alternative (a template-substitution bug on KFintech's side); only the
 * HTML body's <a href> has the real, fully-populated link.
 */
const BODY_PRIORITY: Record<RtaSender, Array<"text" | "html">> = {
  CAMS: ["text", "html"],
  KFINTECH: ["html", "text"],
};

/**
 * KFintech reuses the same scdelivery.kfintech.com/c/ click-tracking
 * domain for every outbound link in every email it sends, not just real
 * report deliveries. Confirmed against real inbox mail: a "Brokerage
 * Annexure/GST Invoice" newsletter matched the same LINK_PATTERNS.KFINTECH
 * regex and yielded a Facebook link, which the pipeline then tried (and
 * failed) to decrypt as a report archive. Every genuine report-delivery
 * subject seen in the real inbox reliably contains "Report for Ref"
 * (91/91 observed, across "Report for Ref. No. :" / "Report for Ref.No :"
 * / "Report for Ref.no." spelling variants); every non-report subject
 * (brokerage invoices, tax-filing promos, GST reminders) does not. CAMS
 * doesn't need this gate: its link pattern
 * (mailbackNN.camsonline.com/mailback_result/) is already report-specific,
 * not a generic click-tracker.
 */
const REPORT_SUBJECT_GATE: Partial<Record<RtaSender, RegExp>> = {
  KFINTECH: /report for ref/i,
};

/** Identifies which RTA sent an email, from its From: address. Returns null for anything else — mail-ingestion should skip those. senderDomains defaults to the hardcoded fallback; real callers pass the live DB-configured values (see rta-sender-config.ts). */
export function identifyRtaSender(fromAddress: string, senderDomains: Record<RtaSender, string> = DEFAULT_SENDER_DOMAINS): RtaSender | null {
  const lower = fromAddress.toLowerCase();
  for (const [rta, domain] of Object.entries(senderDomains) as [RtaSender, string][]) {
    if (domain && lower.includes(domain)) {
      return rta;
    }
  }
  return null;
}

/**
 * Extracts the RTA secure-download link from the email body, checking
 * text/HTML in the RTA-specific reliable order. Returns null for "no data"
 * emails (CAMS), non-report emails from the same sender (KFintech — see
 * REPORT_SUBJECT_GATE), or anything without a real report link.
 */
export function extractDownloadLink(rta: RtaSender, bodyText: string, bodyHtml?: string, subject?: string): string | null {
  const subjectGate = REPORT_SUBJECT_GATE[rta];
  if (subjectGate && !subjectGate.test(subject ?? "")) {
    return null;
  }

  const pattern = LINK_PATTERNS[rta];
  const bodies: Record<"text" | "html", string | undefined> = { text: bodyText, html: bodyHtml };

  for (const part of BODY_PRIORITY[rta]) {
    const body = bodies[part];
    if (!body) {
      continue;
    }
    pattern.lastIndex = 0;
    const match = body.match(pattern)?.[0];
    if (match) {
      return match;
    }
  }
  return null;
}
