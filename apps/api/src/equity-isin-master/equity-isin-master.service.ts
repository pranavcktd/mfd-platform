import { BadRequestException, Injectable } from "@nestjs/common";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, prisma } from "@mfd/db";
import { mergeEquityLists, type MergedEquityRow } from "./equity-isin-merge";

const BATCH_SIZE = 500;

@Injectable()
export class EquityIsinMasterService {
  /**
   * Scans the given server-local folder for an NSE_EQUITY_List* and a
   * BSE_EQUITY_List* file (case-insensitive prefix match, so a re-import
   * with a new date-stamped filename still works without a code change),
   * merges them on ISIN, and bulk-upserts into the global
   * EquityIsinMaster — re-runnable any time the exchanges' lists are
   * refreshed, not a one-shot seed.
   */
  async importFromFolder(folderPath: string) {
    let entries;
    try {
      entries = await readdir(folderPath, { withFileTypes: true });
    } catch (err) {
      throw new BadRequestException(`Could not read folder "${folderPath}": ${err instanceof Error ? err.message : String(err)}`);
    }

    const nseFile = entries.find((e) => e.isFile() && /^NSE_EQUITY_List/i.test(e.name));
    const bseFile = entries.find((e) => e.isFile() && /^BSE_EQUITY_List/i.test(e.name));
    if (!nseFile || !bseFile) {
      throw new BadRequestException(
        `Folder must contain both an NSE_EQUITY_List* and a BSE_EQUITY_List* file (found: ${entries.filter((e) => e.isFile()).map((e) => e.name).join(", ") || "no files"})`,
      );
    }

    const [nseCsvText, bseCsvText] = await Promise.all([
      readFile(join(folderPath, nseFile.name), "utf8"),
      readFile(join(folderPath, bseFile.name), "utf8"),
    ]);

    const merged = mergeEquityLists(nseCsvText, bseCsvText);
    const upserted = await this.bulkUpsert(merged);

    return {
      nseFile: nseFile.name,
      bseFile: bseFile.name,
      totalIsins: merged.length,
      nseOnly: merged.filter((r) => r.isTradedOnNse && !r.isTradedOnBse).length,
      bseOnly: merged.filter((r) => !r.isTradedOnNse && r.isTradedOnBse).length,
      tradedOnBoth: merged.filter((r) => r.isTradedOnNse && r.isTradedOnBse).length,
      withPriceData: merged.filter((r) => r.lastClosePrice !== null).length,
      upserted,
    };
  }

  /** Raw multi-row INSERT ... ON CONFLICT (isin) DO UPDATE, batched — a real bulk upsert, since Prisma has no native "upsert many" and 4,900+ sequential upserts would be far too slow. */
  private async bulkUpsert(rows: MergedEquityRow[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = Prisma.join(
        batch.map(
          (r) => Prisma.sql`(${r.isin}, ${r.companyName}, ${r.nseSymbol}, ${r.bseScripCode}, ${r.bseScripId}, ${r.isTradedOnNse}, ${r.isTradedOnBse}, ${r.preferredExchange}, ${r.lastClosePrice}, ${r.lastPriceDate}::date, now())`,
        ),
      );
      await prisma.$executeRaw`
        INSERT INTO equity_isin_master
          (isin, company_name, nse_symbol, bse_scrip_code, bse_scrip_id, is_traded_on_nse, is_traded_on_bse, preferred_exchange, last_close_price, last_price_date, updated_at)
        VALUES ${values}
        ON CONFLICT (isin) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          nse_symbol = EXCLUDED.nse_symbol,
          bse_scrip_code = EXCLUDED.bse_scrip_code,
          bse_scrip_id = EXCLUDED.bse_scrip_id,
          is_traded_on_nse = EXCLUDED.is_traded_on_nse,
          is_traded_on_bse = EXCLUDED.is_traded_on_bse,
          preferred_exchange = EXCLUDED.preferred_exchange,
          last_close_price = COALESCE(EXCLUDED.last_close_price, equity_isin_master.last_close_price),
          last_price_date = COALESCE(EXCLUDED.last_price_date, equity_isin_master.last_price_date),
          updated_at = now()
      `;
      count += batch.length;
    }
    return count;
  }

  /**
   * Fuzzy search across company name / NSE symbol / BSE scrip code / ISIN
   * — the exact multi-field search spec this master was built for. Tenant-
   * facing (used by the Other Assets equity-shares form), but the data
   * itself is global/unscoped, not filtered by distributor.
   */
  async search(query: string, limit = 15) {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }
    return prisma.equityIsinMaster.findMany({
      where: {
        OR: [
          { companyName: { contains: q, mode: "insensitive" } },
          { nseSymbol: { contains: q, mode: "insensitive" } },
          { bseScripCode: { contains: q, mode: "insensitive" } },
          { isin: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { companyName: "asc" },
    });
  }
}
