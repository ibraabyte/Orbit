import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("privacy indexing", () => {
  it("disallows crawler indexing for the personal dashboard", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/"
      }
    });
  });
});
