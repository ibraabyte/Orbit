import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/manifest.webmanifest"), "utf8"));

describe("web app manifest", () => {
  it("declares stable install metadata", () => {
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      orientation: "portrait-primary"
    });
  });

  it("declares a multipart image share target", () => {
    expect(manifest.share_target).toMatchObject({
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url"
      }
    });
    expect(manifest.share_target.params.files).toEqual([
      {
        name: "files",
        accept: ["image/*", ".png", ".jpg", ".jpeg", ".webp", ".gif"]
      }
    ]);
  });
});
