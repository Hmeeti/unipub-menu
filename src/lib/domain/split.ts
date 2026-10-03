import { serviceFor } from "./money";

export const SHARED_ID = "shared";
export const MAX_SPLIT_PEOPLE = 8;

export type SplitPerson = { id: string; name: string };
export type SplitPart = { id: string; name: string; sub: number; service: number; total: number };
export type SplitLine = { itemId: string; lineTotal: number };

/** Owner of a cart line: explicit assignment if still valid, otherwise the first person. */
export function ownerOf(
  itemId: string,
  assign: Record<string, string>,
  people: SplitPerson[],
): string {
  const owner = assign[itemId];
  if (owner === SHARED_ID) return SHARED_ID;
  if (owner && people.some((p) => p.id === owner)) return owner;
  return people[0]?.id ?? SHARED_ID;
}

/**
 * Same algorithm as the legacy menu: personal lines go to their owner, "shared" lines are
 * divided equally, each person's subtotal is rounded, service is computed per person, and the
 * rounding remainder against the real grand total is added to the last person's service.
 */
export function calcSplit(
  lines: SplitLine[],
  people: SplitPerson[],
  assign: Record<string, string>,
  serviceRateBp: number,
  grandTotal: number,
): SplitPart[] {
  if (!people.length) return [];
  const buckets = new Map<string, number>(people.map((p) => [p.id, 0]));
  for (const line of lines) {
    if (line.lineTotal <= 0) continue;
    const owner = ownerOf(line.itemId, assign, people);
    if (owner === SHARED_ID) {
      const share = line.lineTotal / people.length;
      for (const p of people) buckets.set(p.id, (buckets.get(p.id) ?? 0) + share);
    } else {
      buckets.set(owner, (buckets.get(owner) ?? 0) + line.lineTotal);
    }
  }
  const parts: SplitPart[] = people.map((p) => {
    const sub = Math.round(buckets.get(p.id) ?? 0);
    const service = serviceFor(sub, serviceRateBp);
    return { id: p.id, name: p.name, sub, service, total: sub + service };
  });
  const diff = grandTotal - parts.reduce((s, r) => s + r.total, 0);
  const last = parts[parts.length - 1];
  if (diff && last) {
    last.service += diff;
    last.total += diff;
  }
  return parts;
}
