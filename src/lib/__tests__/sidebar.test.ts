import { describe, expect, it } from "vitest";
import { activeKey, contentWidth, showsSidebar, sidebarSteps, SIDEBAR_WIDTH } from "@/lib/sidebar";

describe("showsSidebar", () => {
  it("shows on iPads in both orientations", () => {
    expect(showsSidebar(744, 1133)).toBe(true); // iPad mini portrait
    expect(showsSidebar(1133, 744)).toBe(true); // iPad mini landscape
    expect(showsSidebar(1032, 1376)).toBe(true); // 13-inch portrait
    expect(showsSidebar(1376, 1032)).toBe(true);
  });

  it("keeps the tab bar on phones, upright or sideways, and in a narrow split view", () => {
    expect(showsSidebar(390, 844)).toBe(false);
    expect(showsSidebar(932, 430)).toBe(false); // big iPhone sideways
    expect(showsSidebar(507, 1133)).toBe(false); // half an iPad
  });

  it("takes its width away from the screen only when shown", () => {
    expect(contentWidth(1194, 834)).toBe(1194 - SIDEBAR_WIDTH);
    expect(contentWidth(390, 844)).toBe(390);
  });
});

describe("activeKey", () => {
  it("maps tabs, sections and pages inside hubs", () => {
    expect(activeKey("/")).toBe("index");
    expect(activeKey("/more")).toBe("more");
    expect(activeKey("/tasks")).toBe("tasks");
    expect(activeKey("/task/abc")).toBe("tasks");
    expect(activeKey("/exercises/12")).toBe("health");
    expect(activeKey("/food-scan")).toBe("health");
    expect(activeKey("/cards")).toBe("finance");
    expect(activeKey("/settings")).toBe("settings");
  });

  it("has no key for sheets, so the item underneath stays lit", () => {
    expect(activeKey("/capture")).toBeUndefined();
  });

  it("lights Movies & TV for its title, list, request and person pages", () => {
    for (const path of ["/title", "/discover", "/requests", "/person"]) expect(activeKey(path)).toBe("media");
  });
});

describe("sidebarSteps", () => {
  it("does nothing for what is already open", () => {
    expect(sidebarSteps("/", "/")).toEqual([]);
    expect(sidebarSteps("/tasks", "/tasks")).toEqual([]);
  });

  it("switches tabs in place", () => {
    expect(sidebarSteps("/", "/more")).toEqual([{ kind: "navigate", href: "/more" }]);
  });

  it("closes open screens before going to a tab", () => {
    expect(sidebarSteps("/finance", "/")).toEqual([{ kind: "dismissAll" }, { kind: "navigate", href: "/" }]);
  });

  it("opens a section over the tabs, or in place of another section", () => {
    expect(sidebarSteps("/", "/tasks")).toEqual([{ kind: "push", href: "/tasks" }]);
    expect(sidebarSteps("/tasks", "/finance")).toEqual([{ kind: "replace", href: "/finance" }]);
    // Inside a hub, its own item takes you back to the hub's front page.
    expect(sidebarSteps("/cards", "/finance")).toEqual([{ kind: "replace", href: "/finance" }]);
  });
});
