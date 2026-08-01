import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { CasFolio, casFolioKey, parseCas } from "./cas-parser";

const CAS_SOURCE = "CAS_IMPORT";
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

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
              balanceUnits: folioData.closingUnitBalance,
              valuationAmount: folioData.valuationAmount,
              navPerUnit: folioData.navPerUnit,
              balanceAsOfDate: folioData.valuationDate ? parseCasDate(folioData.valuationDate) : null,
            },
            update: {
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
}
