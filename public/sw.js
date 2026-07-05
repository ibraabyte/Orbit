const SHELL_CACHE_NAME = "orbit-shell-v5";
const PAGE_CACHE_NAME = "orbit-pages-v1";
const CACHE_ALLOWLIST = [SHELL_CACHE_NAME, PAGE_CACHE_NAME];
const APP_SHELL = ["/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];
const DASHBOARD_PATH = "/dashboard";
const SHARE_TARGET_PATH = "/share-target";
const SHARE_DB_NAME = "orbit-share-target";
const SHARE_STORE_NAME = "shared-captures";
const SHARE_DB_VERSION = 1;
const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SHARE_MAX_FILES = 5;
const SHARE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const SHARE_MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
const SHARE_MAX_TITLE_CHARS = 280;
const SHARE_MAX_TEXT_CHARS = 10000;
const SHARE_MAX_URL_CHARS = 2048;
const SHARE_TOO_LARGE_ERROR = "share-too-large";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("orbit-") && !CACHE_ALLOWLIST.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method === "POST" && isShareTargetRequest(request)) {
    event.respondWith(handleShareTargetPost(request));
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationFetch(request));
    return;
  }

  if (isRuntimeCacheableRequest(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
});

async function handleNavigationFetch(request) {
  const cache = await caches.open(PAGE_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (isCacheableNavigationResponse(response)) {
      await cache.put(navigationCacheKey(request), response.clone());
    }
    return response;
  } catch {
    const cachedPage = await cache.match(navigationCacheKey(request));
    if (cachedPage) return cachedPage;

    const cachedDashboard = await cache.match(navigationCacheKey(new URL(DASHBOARD_PATH, self.location.origin).href));
    if (cachedDashboard) return cachedDashboard;

    return (await caches.match("/offline.html")) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

function navigationCacheKey(requestOrUrl) {
  const url = new URL(typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url);
  url.search = "";
  url.hash = "";
  return url.href;
}

function isCacheableNavigationResponse(response) {
  return Boolean(response && response.ok && response.headers.get("content-type")?.includes("text/html"));
}

function isRuntimeCacheableRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return url.pathname.startsWith("/_next/static/") || APP_SHELL.includes(url.pathname);
  } catch {
    return false;
  }
}

function isShareTargetRequest(request) {
  try {
    return new URL(request.url).pathname === SHARE_TARGET_PATH;
  } catch {
    return false;
  }
}

async function handleShareTargetPost(request) {
  try {
    const formData = await request.formData();
    const id = createShareId();
    const files = sharedImageFilesFromFormData(formData);

    await saveSharedCapture({
      id,
      title: limitedStringField(formData.get("title"), SHARE_MAX_TITLE_CHARS),
      text: limitedStringField(formData.get("text"), SHARE_MAX_TEXT_CHARS),
      url: limitedStringField(formData.get("url"), SHARE_MAX_URL_CHARS),
      files,
      createdAt: Date.now()
    });

    const redirectUrl = new URL(`${SHARE_TARGET_PATH}?shareId=${encodeURIComponent(id)}`, self.location.origin);
    return Response.redirect(redirectUrl.href, 303);
  } catch (error) {
    const errorCode = error?.message === SHARE_TOO_LARGE_ERROR ? "too-large" : "1";
    const redirectUrl = new URL(`${SHARE_TARGET_PATH}?shareError=${errorCode}`, self.location.origin);
    return Response.redirect(redirectUrl.href, 303);
  }
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function limitedStringField(value, maxChars) {
  return stringField(value).slice(0, maxChars);
}

function isSharedImageFile(value) {
  return Boolean(value && typeof value === "object" && "type" in value && typeof value.type === "string" && value.type.startsWith("image/") && "arrayBuffer" in value);
}

function sharedImageFilesFromFormData(formData) {
  const files = [];
  let totalBytes = 0;

  for (const file of formData.getAll("files")) {
    if (!isSharedImageFile(file)) continue;
    if (files.length >= SHARE_MAX_FILES) break;

    const size = typeof file.size === "number" ? file.size : 0;
    if (size > SHARE_MAX_FILE_BYTES || totalBytes + size > SHARE_MAX_TOTAL_FILE_BYTES) {
      throw new Error(SHARE_TOO_LARGE_ERROR);
    }

    files.push(file);
    totalBytes += size;
  }

  return files;
}

function createShareId() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedCapture(payload) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, "readwrite");
    const store = tx.objectStore(SHARE_STORE_NAME);
    store.put(payload);
    const cutoff = Date.now() - SHARE_MAX_AGE_MS;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      if ((current.value?.createdAt ?? 0) < cutoff) current.delete();
      current.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

self.addEventListener("push", (event) => {
  const data = parsePushData(event.data);
  const title = stringField(data.title) || "Orbit reminder";
  const options = {
    body: stringField(data.body) || "A reminder is due.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: notificationTargetUrl(data.url)
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openNotificationTarget(event.notification.data?.url));
});

function parsePushData(data) {
  try {
    const payload = data?.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function notificationTargetUrl(value) {
  try {
    const target = new URL(typeof value === "string" && value.trim() ? value : DASHBOARD_PATH, self.location.origin);
    return target.origin === self.location.origin ? target.href : new URL(DASHBOARD_PATH, self.location.origin).href;
  } catch {
    return new URL(DASHBOARD_PATH, self.location.origin).href;
  }
}

async function openNotificationTarget(value) {
  const targetUrl = notificationTargetUrl(value);
  const clients = await self.clients.matchAll?.({ type: "window", includeUncontrolled: true });
  const windows = Array.isArray(clients) ? clients : [];
  const matchingClient = windows.find((client) => urlsMatch(client.url, targetUrl));
  if (matchingClient?.focus) return matchingClient.focus();

  const orbitClient = windows.find((client) => isSameOriginUrl(client.url) && client.navigate);
  if (orbitClient) {
    const navigatedClient = await orbitClient.navigate(targetUrl);
    return navigatedClient?.focus ? navigatedClient.focus() : orbitClient.focus?.();
  }

  return self.clients.openWindow(targetUrl);
}

function urlsMatch(left, right) {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
}

function isSameOriginUrl(value) {
  try {
    return new URL(value).origin === self.location.origin;
  } catch {
    return false;
  }
}
