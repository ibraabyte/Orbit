import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentFiles = filesUnder(join(process.cwd(), "src", "components")).filter((file) => file.endsWith(".tsx"));

describe("feedback message semantics", () => {
  it("announces plain error and success feedback blocks", () => {
    const offenders = componentFiles.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const simpleMatches = [...text.matchAll(/<div className="(?:error|success)(?: [^"]+)?"(?![^>]* role=)/g)].map((match) => `${file}:${lineFor(text, match.index ?? 0)}`);
      const dynamicMatches = [...text.matchAll(/<div className=\{[^}\n]+(?:"success"|"error")[^}\n]+\}(?![^>]* role=)/g)].map((match) => `${file}:${lineFor(text, match.index ?? 0)}`);
      return [...simpleMatches, ...dynamicMatches];
    });

    expect(offenders).toEqual([]);
  });
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function lineFor(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}
