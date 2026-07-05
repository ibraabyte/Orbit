import { describe, expect, it } from "vitest";
import {
  CAPTURE_MAX_IMAGE_FILE_BYTES,
  CAPTURE_MAX_TOTAL_IMAGE_BYTES,
  assertCaptureImageFilesWithinLimits,
  attachmentObjectPath,
  firstImageFile,
  firstImageFileFromItems,
  imageFiles,
  imageFilesFromItems,
  isImageFile,
  safeAttachmentFilename,
  selectCaptureImageFiles
} from "@/lib/capture-files";

describe("capture file helpers", () => {
  it("detects image files", () => {
    expect(isImageFile(new File(["image"], "shot.png", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File(["text"], "note.txt", { type: "text/plain" }))).toBe(false);
  });

  it("picks the first image file from array-like files", () => {
    const text = new File(["text"], "note.txt", { type: "text/plain" });
    const image = new File(["image"], "receipt.jpeg", { type: "image/jpeg" });

    expect(firstImageFile({ 0: text, 1: image, length: 2 })).toBe(image);
  });

  it("collects every image file from array-like files", () => {
    const text = new File(["text"], "note.txt", { type: "text/plain" });
    const receipt = new File(["image"], "receipt.jpeg", { type: "image/jpeg" });
    const progress = new File(["image"], "progress.webp", { type: "image/webp" });

    expect(imageFiles({ 0: text, 1: receipt, 2: progress, length: 3 })).toEqual([receipt, progress]);
  });

  it("picks the first image file from clipboard items", () => {
    const image = new File(["image"], "paste.png", { type: "image/png" });

    expect(
      firstImageFileFromItems({
        0: { kind: "string", type: "text/plain" },
        1: { kind: "file", type: "image/png", getAsFile: () => image },
        length: 2
      })
    ).toBe(image);
  });

  it("collects every image file from clipboard items", () => {
    const first = new File(["image"], "first.png", { type: "image/png" });
    const second = new File(["image"], "second.jpg", { type: "image/jpeg" });

    expect(
      imageFilesFromItems({
        0: { kind: "file", type: "image/png", getAsFile: () => first },
        1: { kind: "string", type: "text/plain" },
        2: { kind: "file", type: "image/jpeg", getAsFile: () => second },
        length: 3
      })
    ).toEqual([first, second]);
  });

  it("selects the first five valid capture images", () => {
    const files = ["one", "two", "three", "four", "five", "six"].map((name) => sizedImageFile(`${name}.png`, 1));

    expect(selectCaptureImageFiles(files)).toMatchObject({
      files: files.slice(0, 5),
      ignoredCount: 1
    });
  });

  it("rejects capture images over the per-file limit", () => {
    expect(() => assertCaptureImageFilesWithinLimits([sizedImageFile("huge.png", CAPTURE_MAX_IMAGE_FILE_BYTES + 1)])).toThrow('"huge.png" is over the 10 MB image limit.');
  });

  it("rejects capture image groups over the total size limit", () => {
    const files = [sizedImageFile("one.png", 9 * 1024 * 1024), sizedImageFile("two.png", 9 * 1024 * 1024), sizedImageFile("three.png", 9 * 1024 * 1024)];

    expect(() => assertCaptureImageFilesWithinLimits(files)).toThrow("Selected images exceed the 25 MB total image limit.");
    expect(files.reduce((total, file) => total + file.size, 0)).toBeGreaterThan(CAPTURE_MAX_TOTAL_IMAGE_BYTES);
  });

  it("builds safe storage filenames for uploaded captures", () => {
    expect(safeAttachmentFilename(new File(["image"], "Receipt July 01.PNG", { type: "image/png" }))).toBe("Receipt-July-01.png");
    expect(safeAttachmentFilename(new File(["image"], "../😀.webp", { type: "image/webp" }))).toBe("attachment.webp");
    expect(safeAttachmentFilename(new File(["image"], "screen shot", { type: "image/jpeg" }))).toBe("screen-shot.jpg");
  });

  it("builds deterministic attachment object paths", () => {
    const file = new File(["image"], "progress photo.png", { type: "image/png" });

    expect(attachmentObjectPath("user-1", "capture-1", file, 123456)).toBe("user-1/capture-1/123456-progress-photo.png");
  });
});

function sizedImageFile(name: string, size: number, type = "image/png") {
  return { name, size, type } as File;
}
