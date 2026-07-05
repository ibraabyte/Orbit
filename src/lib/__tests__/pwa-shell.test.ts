import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceWorkerText = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const readinessPanelText = readFileSync(join(process.cwd(), "src", "components", "device-readiness.tsx"), "utf8");
const clientStorageText = readFileSync(join(process.cwd(), "src", "lib", "client-storage.ts"), "utf8");
const layoutText = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "manifest.webmanifest"), "utf8")) as {
  icons?: Array<{ src?: string; purpose?: string }>;
};

describe("PWA shell consistency", () => {
  it("keeps service worker and readiness app shell assets aligned", () => {
    const serviceWorkerAssets = extractStringArray(serviceWorkerText, "APP_SHELL");
    const readinessAssets = extractStringArray(readinessPanelText, "appShellAssets");

    expect(readinessAssets).toEqual(serviceWorkerAssets);
    expect(serviceWorkerAssets).toEqual([
      "/offline.html",
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/apple-touch-icon.png",
      "/manifest.webmanifest"
    ]);
  });

  it("keeps every app shell asset present in public output", () => {
    for (const asset of extractStringArray(serviceWorkerText, "APP_SHELL")) {
      expect(existsSync(join(process.cwd(), "public", asset.slice(1)))).toBe(true);
    }
  });

  it("keeps install metadata aligned with cached shell assets", () => {
    const shellAssets = extractStringArray(serviceWorkerText, "APP_SHELL");
    const manifestIconSources = new Set((manifest.icons ?? []).map((icon) => icon.src));

    for (const icon of shellAssets.filter((asset) => asset.startsWith("/icon"))) {
      expect(manifestIconSources.has(icon)).toBe(true);
      expect(layoutText).toContain(`url: "${icon}"`);
    }

    expect(layoutText).toContain('manifest: "/manifest.webmanifest"');
    expect(layoutText).toContain('url: "/apple-touch-icon.png"');
    expect(manifest.icons?.some((icon) => icon.purpose?.split(/\s+/).includes("maskable"))).toBe(true);
  });

  it("keeps personal cache cleanup aligned with service worker cache names", () => {
    const currentShellCache = extractStringConst(serviceWorkerText, "SHELL_CACHE_NAME");
    const pageCache = extractStringConst(serviceWorkerText, "PAGE_CACHE_NAME");

    expect(extractStringConst(clientStorageText, "CURRENT_SHELL_CACHE")).toBe(currentShellCache);
    expect(extractStringArray(clientStorageText, "PERSONAL_CACHE_NAMES")).toContain(pageCache);
  });
});

function extractStringConst(source: string, name: string) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*"([^"]+)"`));
  if (!match) throw new Error(`${name} was not found.`);
  return match[1];
}

function extractStringArray(source: string, name: string) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`${name} was not found.`);

  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}
