import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type PushUnsubscribeResult = {
  browserSubscriptionFound: boolean;
  browserUnsubscribed: boolean;
  serverSubscriptionRemoved: boolean;
};

export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function canUsePush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

export function canUseLocalNotifications() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && typeof Notification !== "undefined";
}

export function shouldAutoRegisterServiceWorker(environment = process.env.NODE_ENV) {
  return environment === "production";
}

export async function cleanupDevelopmentServiceWorker(environment = process.env.NODE_ENV) {
  if (environment === "production" || typeof window === "undefined" || !("serviceWorker" in navigator)) return false;

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheNames = await window.caches.keys().catch(() => []);
    await Promise.all(cacheNames.filter((cacheName) => cacheName.startsWith("orbit-")).map((cacheName) => window.caches.delete(cacheName)));
  }

  return registrations.length > 0;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export function shouldCheckServiceWorkerUpdate(lastCheckedAt: number | null, now = Date.now(), intervalMs = SERVICE_WORKER_UPDATE_INTERVAL_MS) {
  return lastCheckedAt === null || now - lastCheckedAt >= intervalMs;
}

export async function updateServiceWorkerRegistration(registration: { update: () => Promise<unknown> } | null | undefined) {
  if (!registration) return false;
  await registration.update();
  return true;
}

export async function subscribeToPush(publicKey: string) {
  if (!canUsePush()) {
    throw new Error("This browser does not support web push notifications.");
  }

  await requestNotificationPermission();

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Service worker registration failed.");
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
}

export async function showLocalTestNotification() {
  if (!canUseLocalNotifications()) {
    throw new Error("This browser does not support service-worker notifications.");
  }

  await requestNotificationPermission();

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Service worker registration failed.");
  }

  await registration.showNotification("Orbit test reminder", {
    body: "Notifications can appear from this browser or installed PWA.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: "/dashboard"
    }
  });
}

export async function unsubscribeFromPush(supabase: SupabaseClient<Database>): Promise<PushUnsubscribeResult> {
  const emptyResult = {
    browserSubscriptionFound: false,
    browserUnsubscribed: false,
    serverSubscriptionRemoved: false
  };

  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return emptyResult;
  }

  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return emptyResult;

  const [browserUnsubscribed, serverResult] = await Promise.all([
    subscription.unsubscribe().catch(() => false),
    supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint)
  ]);

  return {
    browserSubscriptionFound: true,
    browserUnsubscribed,
    serverSubscriptionRemoved: !serverResult.error
  };
}

async function requestNotificationPermission() {
  if (Notification.permission === "denied") {
    throw new Error("Notifications are blocked for this site. Re-enable them in browser site settings, then refresh Orbit.");
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    throw new Error("Notifications are blocked for this site. Re-enable them in browser site settings, then refresh Orbit.");
  }
  if (permission !== "granted") {
    throw new Error("Notifications are not enabled.");
  }
}
