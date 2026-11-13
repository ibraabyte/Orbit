import { describe, expect, it } from "vitest";
import { eventHidden, hiddenSections, kindHidden, parentOf, pathHidden, SECTION_KEYS, sectionOfPath, sectionOn, withSection } from "@/lib/app-sections";
import { captureStarterKinds, captureStarters } from "@/lib/i18n";
import { KIND_PATHS } from "@/lib/assistant";

const profile = (hidden_sections: string[] | null | undefined) => ({ hidden_sections });

describe("hidden sections", () => {
  it("shows everything with no profile, no list, or an old cached profile without the field", () => {
    expect(hiddenSections(null).size).toBe(0);
    expect(hiddenSections(profile(null)).size).toBe(0);
    expect(hiddenSections({} as { hidden_sections?: string[] }).size).toBe(0);
    expect(sectionOn(undefined, "food")).toBe(true);
  });

  it("switching health off hides food, exercises and WHOOP too", () => {
    expect([...hiddenSections(profile(["health"]))].sort()).toEqual(["exercises", "food", "health", "whoop"]);
    expect(sectionOn(profile(["health"]), "finance")).toBe(true);
    expect(parentOf("food")).toBe("health");
    expect(parentOf("finance")).toBeNull();
  });

  it("ignores names it doesn't know", () => {
    expect([...hiddenSections(profile(["tasks", "cars", "finance"]))]).toEqual(["finance"]);
  });

  it("saves the person's own choices once each, in a fixed order", () => {
    expect(withSection(["finance"], "food", false)).toEqual(["food", "finance"]);
    expect(withSection(["food", "finance"], "food", false)).toEqual(["food", "finance"]);
    expect(withSection(["food", "finance"], "finance", true)).toEqual(["food"]);
    // Health off then on again: its children were never saved, so they come back with it.
    expect(withSection(withSection([], "health", false), "health", true)).toEqual([]);
    expect(withSection(null, "media", false)).toEqual(["media"]);
  });
});

describe("what a hidden section covers", () => {
  const hidden = hiddenSections(profile(["health", "finance"]));

  it("finds the section of a path or link", () => {
    expect(sectionOfPath("/food")).toBe("food");
    expect(sectionOfPath("/exercises/abc")).toBe("exercises");
    expect(sectionOfPath("/workout?id=1")).toBe("exercises");
    expect(sectionOfPath("obligations")).toBe("finance");
    expect(sectionOfPath("/title?id=3")).toBe("media");
    expect(sectionOfPath("/tasks")).toBeNull();
    expect(sectionOfPath("/")).toBeNull();
    expect(sectionOfPath("/settings")).toBeNull();
  });

  it("every section has its own screen", () => {
    for (const key of SECTION_KEYS) expect(sectionOfPath(`/${key === "exercises" ? "exercises" : key}`)).toBe(key);
  });

  it("hides links, day plan events and assistant kinds of hidden sections only", () => {
    expect(pathHidden("/food", hidden)).toBe(true);
    expect(pathHidden("/cards", hidden)).toBe(true);
    expect(pathHidden("/habits", hidden)).toBe(false);
    expect(pathHidden("/tasks", hidden)).toBe(false);
    expect(eventHidden("meal", hidden)).toBe(true);
    expect(eventHidden("bill", hidden)).toBe(true);
    expect(eventHidden("task", hidden)).toBe(false);
    expect(eventHidden("reminder", hidden)).toBe(false);
    expect(kindHidden("expense", hidden)).toBe(true);
    expect(kindHidden("meal", hidden)).toBe(true);
    expect(kindHidden("task", hidden)).toBe(false);
    expect(kindHidden("habit", hidden)).toBe(false);
  });

  it("knows every kind the assistant can change, and every starter word", () => {
    const always = new Set(["task", "task_list", "reminder"]);
    const everything = new Set(SECTION_KEYS);
    for (const kind of Object.keys(KIND_PATHS)) expect(always.has(kind) || kindHidden(kind, everything)).toBe(true);
    expect(captureStarterKinds).toHaveLength(captureStarters.length);
    for (const kind of captureStarterKinds) expect(kindHidden(kind, everything)).toBe(true);
  });
});
