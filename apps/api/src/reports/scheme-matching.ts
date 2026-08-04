import { prisma, Prisma } from "@mfd/db";

export interface SchemeMatchCandidate {
  schemeMasterId: string;
  amcCode: string;
  amcName: string | null;
  schemeCode: string;
  schemeName: string;
  isin: string | null;
  latestNav: string | null;
  score: number;
}

/**
 * Strips plan/option boilerplate ("Regular Plan", "Growth Option", "IDCW",
 * "Direct", ...) so similarity() compares the actual distinctive fund name,
 * not text that's near-identical across hundreds of unrelated schemes.
 * Real bug this fixes: `similarity('UTI Flexi Cap Fund-Regular Plan',
 * 'UTI - Flexi Cap Fund-Growth Option')` scores only 0.40 — LOWER than
 * `similarity(..., 'UTI Retirement Fund - Regular Plan')` at 0.55 — because
 * the shared "Regular Plan"/generic-word text outweighs the actual fund
 * name match. Stripped to their core ("uti flexi cap fund" for both), the
 * real pair scores a perfect 1.0 while unrelated funds drop to ~0.3-0.5.
 * `\y` is Postgres's ARE word-boundary token (not `\b` — confirmed against
 * a real query before trusting it, same discipline as every other regex in
 * this codebase after the `\s`-became-`s` incident).
 *
 * Shared by data-quality.service.ts (matching an RTA folio missing its
 * ISIN) and import-external.service.ts (auto-matching a CAS-imported
 * folio to a real ISIN at import time) — kept in one place after the
 * ranking bugs found tuning this the first time; two independently
 * hand-tuned copies would drift the same way round 20's scheme-name-key
 * duplication did.
 */
const STRIP_PLAN_BOILERPLATE =
  "\\y(direct|regular)\\y\\s*\\y(plan)\\y|\\y(growth|idcw|dividend|bonus)\\y\\s*\\y(option)\\y|\\y(idcw|dividend|reinvestment|payout|growth|bonus|plan|option)\\y";

export function coreSchemeNameSql(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`regexp_replace(regexp_replace(lower(${expr}), ${STRIP_PLAN_BOILERPLATE}, '', 'gi'), '[\\s-]+', ' ', 'g')`;
}

/**
 * Ranked scheme_master candidates for a raw scheme name, optionally boosted
 * by a known/likely AMC name. Same formula as data-quality's original
 * per-folio suggestion query (core-name similarity as the primary signal,
 * full-name similarity as a 0.2-weighted tiebreaker, an AMC-name boost, and
 * Direct/IDCW penalties when the input name doesn't mention them) — see
 * that module's git history for how each term was found necessary against
 * real misranked cases (UTI Flexi Cap Fund, Nippon India Innovation Fund).
 */
export async function findSchemeMatches(
  schemeName: string,
  amcName: string | null | undefined,
  limit = 5,
): Promise<SchemeMatchCandidate[]> {
  const amcNameKnown = Boolean(amcName);
  const mentionsDirect = /direct/i.test(schemeName);
  const mentionsPayout = /idcw|dividend/i.test(schemeName);

  const coreColumn = coreSchemeNameSql(Prisma.sql`scheme_name`);
  const coreInputName = coreSchemeNameSql(Prisma.sql`${schemeName}::text`);

  return prisma.$queryRaw<SchemeMatchCandidate[]>`
    SELECT
      id as "schemeMasterId",
      amc_code as "amcCode",
      amc_name as "amcName",
      scheme_code as "schemeCode",
      scheme_name as "schemeName",
      isin,
      latest_nav::text as "latestNav",
      (
        similarity(${coreColumn}, ${coreInputName})
        + similarity(scheme_name, ${schemeName}) * 0.2
        + CASE WHEN ${amcNameKnown} AND amc_name ILIKE ${amcName ?? ""} THEN 0.3 ELSE 0 END
        - CASE WHEN ${!mentionsDirect} AND scheme_name ILIKE '%direct%' THEN 0.5 ELSE 0 END
        - CASE WHEN ${!mentionsPayout} AND scheme_name ~* 'idcw|dividend' THEN 0.5 ELSE 0 END
      ) as score
    FROM scheme_master
    WHERE isin IS NOT NULL
    ORDER BY score DESC
    LIMIT ${limit}
  `;
}
