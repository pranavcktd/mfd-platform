/**
 * Normalizes a scheme name into a stable matching key — used by both
 * data-quality.service.ts (storing/finding SchemeCorrectionRule matches) and
 * crm-sync.ts (consulting one during ingestion). Kept in one shared place
 * specifically because apps/api and apps/workers are separate TS projects
 * that can't otherwise share this logic except by copy-paste, and a
 * hand-duplicated regex is exactly how the two sides would silently drift
 * apart from each other over time.
 *
 * Collapses whitespace and hyphen-spacing variants that are the same real
 * scheme written slightly differently — confirmed against real data: the
 * same scheme appears as both "Nippon India Innovation Fund-Growth Plan"
 * and "Nippon India Innovation Fund - Growth Plan" across different folios
 * (an RTA-side formatting inconsistency, not two different schemes). A
 * plain lower+trim treated those as unrelated and missed real matches.
 */
export function schemeNameKey(schemeName: string): string {
  return schemeName
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}
