import { describe, expect, it } from "vitest";
import { moveCard, normalizeLayout, TODAY_CARDS, withHidden } from "@/lib/today-layout";

describe("today layout", () => {
  it("reads the old saved list of hidden cards and drops unknown ids", () => {
    expect(normalizeLayout(["brief", "money", "next"])).toEqual({ order: [...TODAY_CARDS], hidden: ["brief"] });
  });

  it("keeps a saved order, drops repeats, and adds missing cards at the end", () => {
    const layout = normalizeLayout({ order: ["health", "brief", "health", "nope"], hidden: [] });
    expect(layout.order.slice(0, 2)).toEqual(["health", "brief"]);
    expect(layout.order).toHaveLength(TODAY_CARDS.length);
    expect(new Set(layout.order).size).toBe(TODAY_CARDS.length);
  });

  it("falls back to the default for nothing saved or junk", () => {
    expect(normalizeLayout(null).order).toEqual([...TODAY_CARDS]);
    expect(normalizeLayout("x").hidden).toEqual([]);
  });

  it("moves a card one place and stays put at the ends", () => {
    expect(moveCard(["brief", "digest", "attention"], "digest", -1)).toEqual(["digest", "brief", "attention"]);
    expect(moveCard(["brief", "digest", "attention"], "digest", 1)).toEqual(["brief", "attention", "digest"]);
    expect(moveCard(["brief", "digest"], "brief", -1)).toEqual(["brief", "digest"]);
    expect(moveCard(["brief", "digest"], "digest", 1)).toEqual(["brief", "digest"]);
  });

  it("hides and shows a card once", () => {
    const hidden = withHidden(withHidden(normalizeLayout(null), "quick", true), "quick", true);
    expect(hidden.hidden).toEqual(["quick"]);
    expect(withHidden(hidden, "quick", false).hidden).toEqual([]);
  });
});
