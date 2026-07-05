import { describe, expect, it } from "vitest";
import { shortcutRouteForInput, shouldTriggerPrivacyShieldShortcut } from "@/lib/keyboard-shortcuts";

describe("keyboard shortcuts", () => {
  it("routes command modifiers with K to Command", () => {
    expect(shortcutRouteForInput({ key: "k", metaKey: true })).toBe("/command");
    expect(shortcutRouteForInput({ key: "K", ctrlKey: true })).toBe("/command");
  });

  it("routes slash to Search", () => {
    expect(shortcutRouteForInput({ key: "/" })).toBe("/search");
  });

  it("ignores shortcuts while editing text", () => {
    expect(shortcutRouteForInput({ key: "k", metaKey: true, editable: true })).toBeNull();
    expect(shortcutRouteForInput({ key: "/", editable: true })).toBeNull();
    expect(shouldTriggerPrivacyShieldShortcut({ key: "l", metaKey: true, shiftKey: true, editable: true })).toBe(false);
  });

  it("does not trigger conflicting modified slash shortcuts", () => {
    expect(shortcutRouteForInput({ key: "/", metaKey: true })).toBeNull();
    expect(shortcutRouteForInput({ key: "/", shiftKey: true })).toBeNull();
    expect(shortcutRouteForInput({ key: "k", metaKey: true, altKey: true })).toBeNull();
  });

  it("uses command or control shift L for the local privacy shield", () => {
    expect(shouldTriggerPrivacyShieldShortcut({ key: "l", metaKey: true, shiftKey: true })).toBe(true);
    expect(shouldTriggerPrivacyShieldShortcut({ key: "L", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(shouldTriggerPrivacyShieldShortcut({ key: "l", metaKey: true })).toBe(false);
    expect(shouldTriggerPrivacyShieldShortcut({ key: "l", metaKey: true, shiftKey: true, altKey: true })).toBe(false);
  });
});
