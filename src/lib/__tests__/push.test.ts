import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
  canUseLocalNotifications,
  canUsePush,
  cleanupDevelopmentServiceWorker,
  shouldCheckServiceWorkerUpdate,
  shouldAutoRegisterServiceWorker,
  showLocalTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  updateServiceWorkerRegistration
} from "@/lib/push";

const originalNotification = globalThis.Notification;
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const originalCaches = Object.getOwnPropertyDescriptor(window, "caches");

afterEach(() => {
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: originalNotification
  });
  if (originalServiceWorker) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
  if (originalCaches) {
    Object.defineProperty(window, "caches", originalCaches);
  } else {
    Reflect.deleteProperty(window, "caches");
  }
  delete (window as Window & { PushManager?: unknown }).PushManager;
});

describe("push support helpers", () => {
  it("distinguishes full web push support from local notification support", () => {
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: { permission: "default", requestPermission: async () => "granted" }
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => null }
    });

    expect(canUseLocalNotifications()).toBe(true);
    expect(canUsePush()).toBe(false);

    (window as Window & { PushManager?: unknown }).PushManager = function PushManager() {};
    expect(canUsePush()).toBe(true);
  });

  it("returns false when notifications are unavailable", () => {
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => null }
    });

    expect(canUseLocalNotifications()).toBe(false);
    expect(canUsePush()).toBe(false);
  });

  it("throttles service worker update checks", () => {
    expect(shouldCheckServiceWorkerUpdate(null, 1_000)).toBe(true);
    expect(shouldCheckServiceWorkerUpdate(1_000, 1_000 + SERVICE_WORKER_UPDATE_INTERVAL_MS - 1)).toBe(false);
    expect(shouldCheckServiceWorkerUpdate(1_000, 1_000 + SERVICE_WORKER_UPDATE_INTERVAL_MS)).toBe(true);
  });

  it("auto-registers the service worker only in production", () => {
    expect(shouldAutoRegisterServiceWorker("production")).toBe(true);
    expect(shouldAutoRegisterServiceWorker("development")).toBe(false);
    expect(shouldAutoRegisterServiceWorker("test")).toBe(false);
  });

  it("cleans stale Orbit service workers and caches during local development", async () => {
    const unregister = vi.fn(async () => true);
    const getRegistrations = vi.fn(async () => [{ unregister }]);
    const keys = vi.fn(async () => ["orbit-shell-v5", "orbit-pages-v1", "external-cache"]);
    const deleteCache = vi.fn(async () => true);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations }
    });
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: { keys, delete: deleteCache }
    });

    await expect(cleanupDevelopmentServiceWorker("development")).resolves.toBe(true);

    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith("orbit-shell-v5");
    expect(deleteCache).toHaveBeenCalledWith("orbit-pages-v1");
    expect(deleteCache).not.toHaveBeenCalledWith("external-cache");
  });

  it("does not clean service workers in production", async () => {
    const getRegistrations = vi.fn(async () => []);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations }
    });

    await expect(cleanupDevelopmentServiceWorker("production")).resolves.toBe(false);
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it("updates a service worker registration when one is available", async () => {
    const update = vi.fn(async () => undefined);

    await expect(updateServiceWorkerRegistration({ update })).resolves.toBe(true);
    await expect(updateServiceWorkerRegistration(null)).resolves.toBe(false);
    expect(update).toHaveBeenCalledOnce();
  });

  it("explains blocked notification permission without re-requesting push", async () => {
    const requestPermission = vi.fn(async () => "denied" as NotificationPermission);
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: { permission: "denied", requestPermission }
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn() }
    });
    (window as Window & { PushManager?: unknown }).PushManager = function PushManager() {};

    await expect(subscribeToPush("public-key")).rejects.toThrow("Notifications are blocked for this site.");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("explains blocked notification permission without re-requesting local notifications", async () => {
    const requestPermission = vi.fn(async () => "denied" as NotificationPermission);
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: { permission: "denied", requestPermission }
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn() }
    });

    await expect(showLocalTestNotification()).rejects.toThrow("Notifications are blocked for this site.");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("unsubscribes the current browser push endpoint and removes the server row", async () => {
    const unsubscribe = vi.fn(async () => true);
    const subscription = { endpoint: "https://push.example/subscription-1", unsubscribe };
    const eq = vi.fn(async () => ({ error: null }));
    const deleteRow = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteRow }));

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => subscription)
          }
        }))
      }
    });
    (window as Window & { PushManager?: unknown }).PushManager = function PushManager() {};

    await expect(unsubscribeFromPush({ from } as never)).resolves.toEqual({
      browserSubscriptionFound: true,
      browserUnsubscribed: true,
      serverSubscriptionRemoved: true
    });
    expect(unsubscribe).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(deleteRow).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("endpoint", "https://push.example/subscription-1");
  });

  it("does nothing when the current browser has no push subscription", async () => {
    const from = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => null)
          }
        }))
      }
    });
    (window as Window & { PushManager?: unknown }).PushManager = function PushManager() {};

    await expect(unsubscribeFromPush({ from } as never)).resolves.toEqual({
      browserSubscriptionFound: false,
      browserUnsubscribed: false,
      serverSubscriptionRemoved: false
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("still reports browser unsubscribe when server cleanup fails", async () => {
    const unsubscribe = vi.fn(async () => true);
    const eq = vi.fn(async () => ({ error: { message: "delete failed" } }));
    const from = vi.fn(() => ({ delete: () => ({ eq }) }));

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => ({ endpoint: "https://push.example/subscription-1", unsubscribe }))
          }
        }))
      }
    });
    (window as Window & { PushManager?: unknown }).PushManager = function PushManager() {};

    await expect(unsubscribeFromPush({ from } as never)).resolves.toEqual({
      browserSubscriptionFound: true,
      browserUnsubscribed: true,
      serverSubscriptionRemoved: false
    });
  });
});
