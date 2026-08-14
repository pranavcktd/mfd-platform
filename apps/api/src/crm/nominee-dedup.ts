/**
 * Real bug found on real data (2026-08-10): the same real nominee can end
 * up as multiple ClientNominee rows — one per folio it's reported against
 * (see mapInvestorMasterNominees's doc comment), and rows for the SAME
 * nominee from different CAMS reports for the same folio family can differ
 * in casing and completeness (confirmed: "SAVITA SINGH"/"WIFE" from WBR9C
 * vs "Savita Singh"/"Not Provided" from a less complete feed). Groups
 * case-insensitively by name and keeps whichever row has a real relation,
 * so the CRM/portal show the nominee once, with its best-known relation.
 */
export function dedupeNominees<T extends { nomineeName: string; relation: string | null }>(nominees: T[]): T[] {
  const isRealRelation = (relation: string | null) => {
    const trimmed = relation?.trim().toLowerCase();
    return !!trimmed && trimmed !== "not provided";
  };

  const byName = new Map<string, T>();
  for (const n of nominees) {
    const key = n.nomineeName.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (!isRealRelation(existing.relation) && isRealRelation(n.relation))) {
      byName.set(key, n);
    }
  }
  return Array.from(byName.values());
}
