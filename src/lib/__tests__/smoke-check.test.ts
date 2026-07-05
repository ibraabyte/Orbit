import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

type SmokeModule = {
  formatSmokeReport: (report: SmokeReport) => string;
  parseSmokeCliArgs: (argv: string[]) => { origin?: string };
  runSmokeChecks: (options: { origin?: string; fetchImpl: FetchLike }) => Promise<SmokeReport>;
  smokeRoutes: Array<{ path: string; label: string }>;
  smokeTargets: Array<{ path: string; label: string }>;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SmokeReport = {
  ok: boolean;
  origin: string;
  results: Array<{ ok: boolean; label: string; detail: string }>;
};

let smoke: SmokeModule;

beforeAll(async () => {
  smoke = (await import(pathToFileURL(join(process.cwd(), "scripts", "smoke-check.mjs")).href)) as SmokeModule;
});

describe("smoke check script", () => {
  it("passes when core routes, PWA assets, privacy headers, and app metadata are healthy", async () => {
    const fetchImpl = vi.fn(mockFetch());

    const report = await smoke.runSmokeChecks({ origin: "http://localhost:3002/", fetchImpl });

    expect(report.ok).toBe(true);
    expect(report.origin).toBe("http://localhost:3002");
    expect(fetchImpl).toHaveBeenCalledTimes(smoke.smokeTargets.length);
    expect(smoke.smokeRoutes.map((route) => route.path)).toEqual(
      expect.arrayContaining(["/", "/dashboard", "/plan", "/review", "/inbox", "/command", "/settings", "/share-target", "/sign-in", "/sign-up"])
    );
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: true, label: "Journal route status" }),
        expect.objectContaining({ ok: true, label: "Finance route content type" }),
        expect.objectContaining({ ok: true, label: "Settings route cache-control" }),
        expect.objectContaining({ ok: true, label: "Web app manifest cache-control" }),
        expect.objectContaining({ ok: true, label: "Web app manifest share target" }),
        expect.objectContaining({ ok: true, label: "Service worker cache-control" }),
        expect.objectContaining({ ok: true, label: "Service worker capabilities" }),
        expect.objectContaining({ ok: true, label: "Robots policy disallow all" })
      ])
    );
    expect(smoke.formatSmokeReport(report)).toContain("Orbit smoke check passed for http://localhost:3002.");
  });

  it("fails when launch-critical PWA metadata or privacy headers are missing", async () => {
    const report = await smoke.runSmokeChecks({
      origin: "https://orbit.example",
      fetchImpl: mockFetch({
        "/manifest.webmanifest": response(
          JSON.stringify({
            name: "Orbit",
            start_url: "/dashboard",
            display: "browser",
            icons: []
          }),
          {
            headers: securityHeaders("application/manifest+json", {
              "cache-control": "",
              "content-security-policy": "",
              "cross-origin-opener-policy": "",
              "x-robots-tag": ""
            })
          }
        )
      })
    });

    expect(report.ok).toBe(false);
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: false, label: "Web app manifest x-robots-tag" }),
        expect.objectContaining({ ok: false, label: "Web app manifest cache-control" }),
        expect.objectContaining({ ok: false, label: "Web app manifest content-security-policy" }),
        expect.objectContaining({ ok: false, label: "Web app manifest cross-origin-opener-policy" }),
        expect.objectContaining({ ok: false, label: "Web app manifest install metadata" }),
        expect.objectContaining({ ok: false, label: "Web app manifest share target" }),
        expect.objectContaining({ ok: false, label: "Web app manifest icons" })
      ])
    );
    expect(smoke.formatSmokeReport(report)).toContain("Orbit smoke check failed for https://orbit.example.");
  });

  it("parses CLI origin arguments", () => {
    expect(smoke.parseSmokeCliArgs(["--origin", "https://orbit.example"])).toEqual({ origin: "https://orbit.example" });
    expect(smoke.parseSmokeCliArgs(["--origin=https://orbit.example"])).toEqual({ origin: "https://orbit.example" });
  });
});

function mockFetch(overrides: Record<string, Response> = {}): FetchLike {
  return async (input) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const path = new URL(requestUrl).pathname;
    if (overrides[path]) return overrides[path];

    if (path === "/manifest.webmanifest") {
      return response(
        JSON.stringify({
          name: "Orbit",
          start_url: "/dashboard",
          display: "standalone",
          share_target: {
            action: "/share-target",
            method: "POST"
          },
          icons: [
            { src: "/icon-192.png", sizes: "192x192", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", purpose: "any maskable" }
          ],
          shortcuts: [{ url: "/dashboard" }, { url: "/plan" }, { url: "/review" }, { url: "/command" }]
        }),
        {
          headers: securityHeaders("application/manifest+json", {
            "cache-control": "public, max-age=0, must-revalidate"
          })
        }
      );
    }

    if (path === "/sw.js") {
      return response("const SHELL_CACHE_NAME = 'orbit-shell-v5'; function handleShareTargetPost() {} self.registration.showNotification('Orbit');", {
        headers: securityHeaders("application/javascript", {
          "cache-control": "public, max-age=0, must-revalidate",
          "service-worker-allowed": "/"
        })
      });
    }

    if (path === "/robots.txt") {
      return response("User-agent: *\nDisallow: /\n", {
        headers: securityHeaders("text/plain")
      });
    }

    if (smoke.smokeRoutes.some((route) => route.path === path)) {
      return response("<!doctype html><title>Orbit</title>", {
        headers: securityHeaders("text/html; charset=utf-8")
      });
    }

    return response("Not found", { status: 404, headers: securityHeaders("text/plain") });
  };
}

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    ...init
  });
}

function securityHeaders(contentType: string, overrides: Record<string, string> = {}) {
  return {
    "content-type": contentType,
    "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    ...overrides
  };
}
