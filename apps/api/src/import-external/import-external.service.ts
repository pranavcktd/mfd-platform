import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { findSchemeMatches } from "../reports/scheme-matching";
import { CasFolio, casFolioKey, parseCas } from "./cas-parser";

const CAS_SOURCE = "CAS_IMPORT";
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Only apply an auto-match with NO human review when it's this confident —
 * unlike data-quality.service.ts's suggestion list (a human picks from
 * several candidates there), a wrong ISIN attached here silently would
 * misprice this folio's live value AND its capital-gains tax classification
 * down the line, so the bar is intentionally high: real correct matches
 * (verified against real UTI/Nippon India cases) score 1.1-1.5 once the
 * AMC-name boost engages; real wrong-fund-same-AMC candidates land under 1.0.
 */
const CAS_ISIN_AUTO_MATCH_THRESHOLD = 1.2;

/**
 * CAS statements prefix each scheme with the RTA's own short scheme code
 * (e.g. "HHPDGR-HDFC Pharma and Healthcare Fund Direct Growth (Non-Demat)")
 * and suffix a demat-status note — neither exists in AMFI's own scheme
 * names, so both are stripped before fuzzy-matching against scheme_master
 * (real scheme_master names never start with a bare short alnum code
 * directly followed by a hyphen, confirmed by checking real AMFI-sourced
 * rows, so this can't accidentally eat a real AMC name's beginning).
 */
function cleanCasSchemeNameForMatching(schemeName: string): string {
  return schemeName
    .replace(/^[a-z0-9]{2,15}-/i, "")
    .replace(/\s*\(\s*(non[\s-]?demat|demat)\s*\)\s*$/i, "")
    .trim();
}

function parseCasDate(ddMonYyyy: string): Date {
  const [day, mon, year] = ddMonYyyy.split("-");
  const month = MONTHS[mon];
  if (month === undefined) {
    throw new Error(`Unrecognized CAS date format: ${ddMonYyyy}`);
  }
  return new Date(Date.UTC(Number(year), month, Number(day)));
}

function hash(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex");
}

export interface ClientImportSummary {
  clientId: string;
  clientName: string;
  panNumber: string;
  wasNewlyCreated: boolean;
  foliosImported: number;
  foliosMatchedExisting: number;
  transactionsImported: number;
  transactionsSkipped: number;
  foliosFailed: Array<{ folioNumber: string; schemeName: string; reason: string }>;
}

export interface CasFolioSummary {
  folioId: string;
  schemeName: string | null;
  amcCode: string;
  folioNumber: string;
  transactionCount: number;
  valuationAmount: string | null;
}

export interface CasClientSummary {
  clientId: string;
  clientName: string;
  panNumber: string | null;
  /** Exists only because this exact CAS import created them (no PAN match at the time) — still flagged needsReview, so deleting all their folios below is likely to also remove the client itself. */
  isAutoCreatedPendingReview: boolean;
  folios: CasFolioSummary[];
}

export interface CasDataDeleteResult {
  transactionsDeleted: number;
  foliosDeleted: number;
  clientsDeleted: number;
}

export interface CasPreviewFolio {
  key: string;
  panNumber: string;
  investorName: string | null;
  amcName: string | null;
  schemeName: string;
  folioNumber: string;
  closingUnitBalance: number | null;
  navPerUnit: number | null;
  valuationAmount: number | null;
  transactionCount: number;
  /** This client already exists in the CRM (matched by PAN) — vs. a brand-new client that would need to be created on import. */
  clientExists: boolean;
  clientName: string | null;
  /** Already tracked via this client's real RTA-sourced data (same folio number) — importing it would be skipped as a duplicate, shown upfront so the MFD can deselect it if they want. */
  alreadyTrackedViaRta: boolean;
}

@Injectable()
export class ImportExternalService {
  private async decryptAndParse(fileBuffer: Buffer, password: string) {
    let rawText: string;
    try {
      const parser = new PDFParse({ data: fileBuffer, password });
      const result = await parser.getText();
      rawText = result.text;
    } catch (err) {
      throw new BadRequestException(
        `Could not open this PDF — check the password. (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return parseCas(rawText);
  }

  /**
   * Parses the CAS PDF and returns a per-PAN, per-scheme summary WITHOUT
   * writing anything to the database — lets the MFD see exactly what's in
   * the statement (value/units/NAV per folio, and whether it's already
   * covered by real RTA data) and choose which rows to actually bring in,
   * before importCas commits anything. Real scenario this exists for: an
   * MFD only wants a couple of external holdings imported, not their
   * client's entire other-broker portfolio.
   */
  async previewCas(fileBuffer: Buffer, password: string) {
    const distributorId = TenantContext.currentDistributorId();
    const parsed = await this.decryptAndParse(fileBuffer, password);

    if (parsed.folios.length === 0) {
      return { foliosFound: 0, foliosSkippedNoPan: 0, panNumbersFound: parsed.panNumbers, folios: [] as CasPreviewFolio[], rawTextSample: parsed.rawTextSample };
    }

    let foliosSkippedNoPan = 0;
    const withPan: CasFolio[] = [];
    for (const f of parsed.folios) {
      if (!f.panNumber) {
        foliosSkippedNoPan++;
        continue;
      }
      withPan.push(f);
    }

    const distinctPans = Array.from(new Set(withPan.map((f) => f.panNumber as string)));
    const existingClients = await prisma.client.findMany({
      where: { distributorId, panNumber: { in: distinctPans } },
      select: { id: true, name: true, panNumber: true },
    });
    const clientByPan = new Map(existingClients.map((c) => [c.panNumber as string, c]));

    const rtaFoliosByClient = new Map<string, Set<string>>();
    for (const client of existingClients) {
      const rtaFolios = await prisma.folio.findMany({
        where: { distributorId, clientId: client.id, source: "RTA_MAILBACK" },
        select: { folioNumber: true },
      });
      rtaFoliosByClient.set(client.id, new Set(rtaFolios.map((f) => f.folioNumber.trim())));
    }

    const folios: CasPreviewFolio[] = withPan.map((f) => {
      const client = clientByPan.get(f.panNumber as string);
      const rtaFolioNumbers = client ? rtaFoliosByClient.get(client.id) : undefined;
      return {
        key: casFolioKey(f),
        panNumber: f.panNumber as string,
        investorName: f.investorName,
        amcName: f.amcName,
        schemeName: f.schemeName,
        folioNumber: f.folioNumber,
        closingUnitBalance: f.closingUnitBalance,
        navPerUnit: f.navPerUnit,
        valuationAmount: f.valuationAmount,
        transactionCount: f.transactions.length,
        clientExists: Boolean(client),
        clientName: client?.name ?? null,
        alreadyTrackedViaRta: Boolean(rtaFolioNumbers?.has(f.folioNumber.trim())),
      };
    });

    return {
      foliosFound: parsed.folios.length,
      foliosSkippedNoPan,
      panNumbersFound: parsed.panNumbers,
      folios,
    };
  }

  /**
   * Decrypts (via the supplied password) and parses a CAMS/KFintech CAS
   * PDF, then upserts every SELECTED folio/transaction it finds — marked
   * `source: "CAS_IMPORT"` (Folio and Transaction both) so the CRM/reports
   * UI can visibly distinguish "came from your regular RTA mail" from
   * "the client's full external portfolio, imported once".
   *
   * `selectedKeys` (from previewCas's own `key` field on each row) scopes
   * the import to only the folios the MFD actually checked in the preview
   * step — omit it (or pass undefined) to import everything found, same as
   * the pre-preview behavior.
   *
   * A single CAS can consolidate several family members under one
   * statement (CAMS's own documented convention: consolidation is by
   * email id), so mapping is done PER FOLIO against that folio's own
   * "PAN:" line — never a single document-level PAN. Each distinct PAN is
   * matched against this distributor's existing clients; a PAN with no
   * match gets a brand-new Client created from just PAN + investor name,
   * flagged `needsReview: true` so the admin gets a persistent alert to
   * fill in the rest (CRM/MIS surfaces this — see markReviewed).
   *
   * A CAS-sourced folio never gets an arnProfileId (it may belong to an
   * AMC this MFD doesn't service at all) and is idempotent on re-import
   * (same folio+date+description+amount+units hash, skipDuplicates) —
   * importing the same statement twice is safe.
   *
   * Before creating anything, each CAS folio is checked against this
   * client's EXISTING RTA-sourced folios by folio number — the RTA's own
   * folio number is the one identifier that's identical whether it shows
   * up in the regular RTA mailback feed or inside a CAS (both trace back
   * to the same AMC/RTA-assigned folio). A match means this holding is
   * already tracked from real RTA data, so the CAS copy is skipped
   * entirely (no duplicate Folio or Transaction rows) — only folios NOT
   * already covered by RTA data (an AMC this MFD doesn't hold an ARN for,
   * for instance) get created, and those are the ones carrying
   * `source: "CAS_IMPORT"` so the UI can mark them as external.
   *
   * Each folio is processed in its own try/catch — one malformed row
   * (e.g. an unparseable date) is recorded in that client's
   * `foliosFailed` with a real reason instead of aborting the whole
   * statement's import.
   */
  async importCas(fileBuffer: Buffer, password: string, selectedKeys?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const parsed = await this.decryptAndParse(fileBuffer, password);

    if (parsed.folios.length === 0) {
      return {
        imported: false,
        foliosFound: 0,
        clients: [] as ClientImportSummary[],
        foliosSkippedNoPan: 0,
        panNumbersFound: parsed.panNumbers,
        rawTextSample: parsed.rawTextSample,
      };
    }

    const selectedKeySet = selectedKeys ? new Set(selectedKeys) : undefined;

    // Group folios by their own per-folio PAN — a folio with no PAN at all
    // (extraction miss) can't be safely attributed to any client, so it's
    // counted separately rather than guessed at.
    const foliosByPan = new Map<string, CasFolio[]>();
    let foliosSkippedNoPan = 0;
    for (const folio of parsed.folios) {
      if (!folio.panNumber) {
        foliosSkippedNoPan++;
        continue;
      }
      if (selectedKeySet && !selectedKeySet.has(casFolioKey(folio))) {
        continue;
      }
      const list = foliosByPan.get(folio.panNumber) ?? [];
      list.push(folio);
      foliosByPan.set(folio.panNumber, list);
    }

    const clientSummaries: ClientImportSummary[] = [];

    for (const [pan, folios] of foliosByPan) {
      let client = await prisma.client.findFirst({ where: { distributorId, panNumber: pan } });
      let wasNewlyCreated = false;
      if (!client) {
        const investorName = folios.find((f) => f.investorName)?.investorName ?? `CAS Import (${pan})`;
        client = await prisma.client.create({
          data: {
            distributorId,
            panNumber: pan,
            name: investorName,
            needsReview: true,
            reviewReason: "Auto-created from CAS import — fill in remaining client details",
          },
        });
        wasNewlyCreated = true;
      }

      const existingRtaFolios = await prisma.folio.findMany({
        where: { distributorId, clientId: client.id, source: "RTA_MAILBACK" },
        select: { folioNumber: true },
      });
      const rtaFolioNumbers = new Set(existingRtaFolios.map((f) => f.folioNumber.trim()));

      let transactionsImported = 0;
      let transactionsSkipped = 0;
      let foliosMatchedExisting = 0;
      const foliosFailed: Array<{ folioNumber: string; schemeName: string; reason: string }> = [];

      for (const folioData of folios) {
        if (rtaFolioNumbers.has(folioData.folioNumber.trim())) {
          foliosMatchedExisting++;
          continue;
        }

        try {
          const amcCode = `CAS:${folioData.amcName ?? "Unknown AMC"}`;
          const schemeCode = `CAS:${folioData.schemeName}`;

          // Try to identify the real ISIN so this folio gets a live AMFI NAV
          // like any RTA-sourced holding, instead of being frozen at the
          // valuation snapshot printed in the CAS PDF at import time. Only
          // applied above a high confidence bar (see
          // CAS_ISIN_AUTO_MATCH_THRESHOLD) since nothing reviews this match
          // before it's attached — leaving isin null (folio still shows its
          // CAS-snapshot current value, just not live) is the safe default
          // when no candidate clears the bar.
          const cleanedSchemeName = cleanCasSchemeNameForMatching(folioData.schemeName);
          const matches = await findSchemeMatches(cleanedSchemeName, folioData.amcName, 1);
          const matchedIsin =
            matches[0] && matches[0].score >= CAS_ISIN_AUTO_MATCH_THRESHOLD ? matches[0].isin : null;

          const folio = await prisma.folio.upsert({
            where: {
              distributorId_amcCode_folioNumber_schemeCode: {
                distributorId,
                amcCode,
                folioNumber: folioData.folioNumber,
                schemeCode,
              },
            },
            create: {
              distributorId,
              clientId: client.id,
              amcCode,
              folioNumber: folioData.folioNumber,
              schemeCode,
              schemeName: folioData.schemeName,
              source: CAS_SOURCE,
              isin: matchedIsin ?? undefined,
              balanceUnits: folioData.closingUnitBalance,
              valuationAmount: folioData.valuationAmount,
              navPerUnit: folioData.navPerUnit,
              balanceAsOfDate: folioData.valuationDate ? parseCasDate(folioData.valuationDate) : null,
            },
            update: {
              isin: matchedIsin ?? undefined,
              balanceUnits: folioData.closingUnitBalance,
              valuationAmount: folioData.valuationAmount,
              navPerUnit: folioData.navPerUnit,
              balanceAsOfDate: folioData.valuationDate ? parseCasDate(folioData.valuationDate) : undefined,
            },
          });

          for (const txn of folioData.transactions) {
            const transactionDate = parseCasDate(txn.date);
            const idempotencyHash = hash([distributorId, folio.id, txn.date, txn.description, txn.amount, txn.units]);
            const result = await prisma.transaction.createMany({
              data: [
                {
                  distributorId,
                  folioId: folio.id,
                  transactionType: txn.transactionType,
                  transactionDescription: txn.description,
                  transactionDate,
                  amount: txn.amount,
                  units: txn.units,
                  navPerUnit: txn.navPerUnit,
                  idempotencyHash,
                  source: CAS_SOURCE,
                },
              ],
              skipDuplicates: true,
            });
            if (result.count > 0) {
              transactionsImported++;
            } else {
              transactionsSkipped++;
            }
          }
        } catch (err) {
          foliosFailed.push({
            folioNumber: folioData.folioNumber,
            schemeName: folioData.schemeName,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      clientSummaries.push({
        clientId: client.id,
        clientName: client.name,
        panNumber: pan,
        wasNewlyCreated,
        foliosImported: folios.length - foliosMatchedExisting - foliosFailed.length,
        foliosMatchedExisting,
        transactionsImported,
        transactionsSkipped,
        foliosFailed,
      });
    }

    return {
      imported: true,
      foliosFound: parsed.folios.length,
      foliosSelected: selectedKeySet ? selectedKeySet.size : parsed.folios.length,
      foliosSkippedNoPan,
      clients: clientSummaries,
      panNumbersFound: parsed.panNumbers,
    };
  }

  /**
   * Real CAS-imported data currently on file, grouped per client and then
   * per folio — lets the UI offer "delete this one fund" or "delete
   * everything for this client" instead of only an all-or-nothing wipe.
   */
  async getCasDataSummary(): Promise<CasClientSummary[]> {
    const distributorId = TenantContext.currentDistributorId();
    const folios = await prisma.folio.findMany({
      where: { distributorId, source: CAS_SOURCE },
      select: {
        id: true,
        schemeName: true,
        amcCode: true,
        folioNumber: true,
        valuationAmount: true,
        client: { select: { id: true, name: true, panNumber: true, needsReview: true, reviewReason: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { valuationAmount: "desc" },
    });

    const byClient = new Map<string, CasClientSummary>();
    for (const f of folios) {
      let entry = byClient.get(f.client.id);
      if (!entry) {
        entry = {
          clientId: f.client.id,
          clientName: f.client.name,
          panNumber: f.client.panNumber,
          isAutoCreatedPendingReview: f.client.needsReview && (f.client.reviewReason?.startsWith("Auto-created from CAS import") ?? false),
          folios: [],
        };
        byClient.set(f.client.id, entry);
      }
      entry.folios.push({
        folioId: f.id,
        schemeName: f.schemeName,
        amcCode: f.amcCode,
        folioNumber: f.folioNumber,
        transactionCount: f._count.transactions,
        valuationAmount: f.valuationAmount?.toString() ?? null,
      });
    }
    return Array.from(byClient.values());
  }

  /**
   * Removes the given CAS-imported folios (and their transactions) for this
   * distributor — scoped to an explicit folio id list so a partial "just
   * this fund" or "just this client's folios" delete is a normal case, not
   * a special one; the caller (frontend) computes "all of them" itself when
   * the admin wants a full wipe. Every targeted id is re-checked against
   * `source: "CAS_IMPORT"` here (not trusted blindly from the request) so
   * this can never be used to delete a real RTA_MAILBACK folio even if a
   * stale/tampered id list were somehow submitted.
   *
   * Transactions are deleted before their Folios (no ON DELETE CASCADE on
   * that FK — a Folio with Transactions still pointing at it would
   * otherwise fail to delete). Also removes any Client that exists ONLY
   * because of a CAS import (the auto-create-on-no-PAN-match path in
   * importCas, flagged needsReview with that exact reason) and now has zero
   * folios left — a client matched by PAN to a pre-existing real client is
   * never touched, since deleting their CAS folios above leaves their real
   * RTA data untouched.
   */
  async deleteCasData(folioIds: string[]): Promise<CasDataDeleteResult> {
    if (folioIds.length === 0) return { transactionsDeleted: 0, foliosDeleted: 0, clientsDeleted: 0 };
    const distributorId = TenantContext.currentDistributorId();

    const targetFolios = await prisma.folio.findMany({
      where: { id: { in: folioIds }, distributorId, source: CAS_SOURCE },
      select: { id: true, clientId: true },
    });
    if (targetFolios.length === 0) return { transactionsDeleted: 0, foliosDeleted: 0, clientsDeleted: 0 };
    const targetFolioIds = targetFolios.map((f) => f.id);
    const affectedClientIds = new Set(targetFolios.map((f) => f.clientId));

    const { count: transactionsDeleted } = await prisma.transaction.deleteMany({
      where: { distributorId, source: CAS_SOURCE, folioId: { in: targetFolioIds } },
    });
    const { count: foliosDeleted } = await prisma.folio.deleteMany({
      where: { id: { in: targetFolioIds }, distributorId, source: CAS_SOURCE },
    });

    let clientsDeleted = 0;
    for (const clientId of affectedClientIds) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { needsReview: true, reviewReason: true },
      });
      if (!client?.needsReview || !client.reviewReason?.startsWith("Auto-created from CAS import")) continue;
      const remainingFolios = await prisma.folio.count({ where: { clientId } });
      if (remainingFolios > 0) continue;
      try {
        await prisma.client.delete({ where: { id: clientId } });
        clientsDeleted++;
      } catch {
        // Some other real data (nominee, bank account, other asset, ...)
        // still references this client — leave it, don't force it.
      }
    }

    return { transactionsDeleted, foliosDeleted, clientsDeleted };
  }
}
