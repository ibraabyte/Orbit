// iPad sidebar: when it shows, which item is lit, and how a tap moves between screens.
// Pure helpers, so they can be tested without a device; the sidebar itself is src/components/sidebar.tsx.

/** Room the sidebar takes at the side of the window: the glass panel plus its margins. */
export const SIDEBAR_WIDTH = 280;

/**
 * True on an iPad-sized window, portrait or landscape. A phone held sideways is wide but short, so it keeps the tab bar.
 * A narrow iPad split view (under 700 wide) keeps the tab bar too.
 */
export function showsSidebar(width: number, height: number) {
  return width >= 700 && Math.min(width, height) >= 600;
}

/** Width left for the screen beside the sidebar. */
export function contentWidth(width: number, height: number) {
  return showsSidebar(width, height) ? width - SIDEBAR_WIDTH : width;
}

// Screens that open from inside a hub light up the hub in the sidebar.
const parents: Record<string, string> = {
  food: "health",
  "food-add": "health",
  "food-scan": "health",
  "food-photo": "health",
  exercises: "health",
  gym: "health",
  injuries: "health",
  whoop: "health",
  "health-goals": "health",
  accounts: "finance",
  investments: "finance",
  cards: "finance",
  obligations: "finance",
  task: "tasks"
};

// Sheets that open over a screen; the item under them stays lit.
const sheets = new Set(["capture", "title"]);

/** The sidebar key for a path: "index" for Today, "more", a section key, or undefined for a sheet or unknown path. */
export function activeKey(path: string): string | undefined {
  const first = path.split("?")[0].split("/").filter(Boolean)[0];
  if (!first) return "index";
  if (sheets.has(first)) return undefined;
  return parents[first] ?? first;
}

/** Today and More are tabs; everything else is a screen on top of them. */
export function isTabPath(path: string) {
  return activeKey(path) === "index" || activeKey(path) === "more";
}

export type NavStep = { kind: "navigate" | "push" | "replace" | "dismissAll"; href?: string };

/**
 * Steps to move from the open path to a sidebar item, so the back button never piles up screens:
 * a tab is reached by closing the screens on top and switching tab; a section opens over the tabs, or replaces the
 * section that is open. Tapping what is already open does nothing.
 */
export function sidebarSteps(from: string, to: string): NavStep[] {
  const toKey = activeKey(to);
  if (from.split("?")[0] === to || (activeKey(from) === toKey && isTabPath(to))) return [];
  const onTab = isTabPath(from);
  if (isTabPath(to)) return onTab ? [{ kind: "navigate", href: to }] : [{ kind: "dismissAll" }, { kind: "navigate", href: to }];
  return [{ kind: onTab ? "push" : "replace", href: to }];
}
