import { describe, expect, it } from "vitest";
import { barHeights, ringRotations } from "@/lib/ring";

describe("ringRotations", () => {
  it("fills the right half first, then the left", () => {
    expect(ringRotations(0)).toEqual({ right: 0, left: 0 });
    expect(ringRotations(0.25)).toEqual({ right: 90, left: 0 });
    expect(ringRotations(0.5)).toEqual({ right: 180, left: 0 });
    expect(ringRotations(0.75)).toEqual({ right: 180, left: 90 });
    expect(ringRotations(1)).toEqual({ right: 180, left: 180 });
  });

  it("clamps out-of-range and bad values", () => {
    expect(ringRotations(-1)).toEqual({ right: 0, left: 0 });
    expect(ringRotations(3)).toEqual({ right: 180, left: 180 });
    expect(ringRotations(Number.NaN)).toEqual({ right: 0, left: 0 });
  });
});

describe("barHeights", () => {
  it("scales to the tallest day and keeps a stub for empty days", () => {
    expect(barHeights([0, 30, 60])).toEqual([4, 50, 100]);
  });

  it("does not divide by zero when everything is empty", () => {
    expect(barHeights([0, 0])).toEqual([4, 4]);
  });
});
