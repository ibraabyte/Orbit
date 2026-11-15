// Which cards Today shows and in what order, below the prayer card (which always comes first).
// Saved on the device only. Before this, only a list of hidden cards was saved (orbit.today.hidden); it is read once.

// The order is the 2026-11 Today design: body rings, the four numbers, habits, the rest of today, the day's line,
// the week's spending and what is coming up; then the older cards.
export const TODAY_CARDS = ["brief", "health", "quick", "habits", "attention", "upnext", "spend", "docs", "meds", "workout", "dayplan", "digest", "week"] as const;
export type TodayCard = (typeof TODAY_CARDS)[number];
export type TodayLayout = { order: TodayCard[]; hidden: TodayCard[] };

export const defaultLayout: TodayLayout = { order: [...TODAY_CARDS], hidden: [] };

const known = (value: unknown): value is TodayCard => TODAY_CARDS.includes(value as TodayCard);

/** A saved layout made safe: unknown or repeated cards dropped, and cards added since (missing ones) put at the end.
 * Also takes the old saved form, a bare list of hidden ids. */
export function normalizeLayout(saved: unknown): TodayLayout {
  const raw = Array.isArray(saved) ? { hidden: saved } : saved && typeof saved === "object" ? (saved as { order?: unknown; hidden?: unknown }) : {};
  const order = [...new Set(Array.isArray(raw.order) ? raw.order.filter(known) : [])];
  for (const card of TODAY_CARDS) if (!order.includes(card)) order.push(card);
  const hidden = [...new Set(Array.isArray(raw.hidden) ? raw.hidden.filter(known) : [])];
  return { order, hidden };
}

/** The order with one card swapped with its neighbour (by -1: up, by 1: down). At either end it stays. */
export function moveCard(order: readonly TodayCard[], card: TodayCard, by: -1 | 1): TodayCard[] {
  const from = order.indexOf(card);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function withHidden(layout: TodayLayout, card: TodayCard, hide: boolean): TodayLayout {
  const hidden = layout.hidden.filter((item) => item !== card);
  return { ...layout, hidden: hide ? [...hidden, card] : hidden };
}
