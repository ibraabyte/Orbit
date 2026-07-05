export const privacyShieldAutoLockStorageKey = "orbit.privacy-shield.auto-lock-on-hidden";
export const privacyShieldRequestEvent = "orbit:privacy-shield";

export function readPrivacyShieldAutoLock(storage: Storage | undefined = safeLocalStorage()): boolean {
  if (!storage) return false;
  return storage.getItem(privacyShieldAutoLockStorageKey) === "true";
}

export function savePrivacyShieldAutoLock(enabled: boolean, storage: Storage | undefined = safeLocalStorage()) {
  if (!storage) return;

  if (enabled) {
    storage.setItem(privacyShieldAutoLockStorageKey, "true");
  } else {
    storage.removeItem(privacyShieldAutoLockStorageKey);
  }
}

function safeLocalStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
