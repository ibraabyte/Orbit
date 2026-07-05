import { afterEach, describe, expect, it } from "vitest";
import { privacyShieldAutoLockStorageKey, readPrivacyShieldAutoLock, savePrivacyShieldAutoLock } from "@/lib/privacy-shield";

afterEach(() => {
  localStorage.clear();
});

describe("privacy shield preferences", () => {
  it("defaults the auto-lock preference off", () => {
    expect(readPrivacyShieldAutoLock(localStorage)).toBe(false);
  });

  it("stores and clears the auto-lock preference", () => {
    savePrivacyShieldAutoLock(true, localStorage);

    expect(localStorage.getItem(privacyShieldAutoLockStorageKey)).toBe("true");
    expect(readPrivacyShieldAutoLock(localStorage)).toBe(true);

    savePrivacyShieldAutoLock(false, localStorage);

    expect(localStorage.getItem(privacyShieldAutoLockStorageKey)).toBeNull();
    expect(readPrivacyShieldAutoLock(localStorage)).toBe(false);
  });
});
