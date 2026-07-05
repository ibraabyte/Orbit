import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type MockWindowClient = {
  url: string;
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<MockWindowClient | null>;
};

type MockStoredCapture = {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  files?: unknown[];
  createdAt?: number;
  [key: string]: unknown;
};

type MockIdbRequest<T> = {
  result?: T;
  error?: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
  onupgradeneeded?: () => void;
};

type MockIdbCursor = {
  value: MockStoredCapture;
  delete: () => void;
  continue: () => void;
};

type MockIdbObjectStore = {
  put: (payload: MockStoredCapture) => void;
  openCursor: () => MockIdbRequest<MockIdbCursor | null>;
  get: (id: string) => MockIdbRequest<MockStoredCapture | undefined>;
  delete: (id: string) => void;
};

type MockIdbTransaction = {
  error?: unknown;
  oncomplete?: () => void;
  onerror?: () => void;
  objectStore: (name: string) => MockIdbObjectStore;
};

describe("service worker runtime caching", () => {
  it("keeps current app caches and removes legacy Orbit caches on activation", async () => {
    const worker = loadServiceWorker();
    await worker.caches.open("orbit-shell-v4");
    await worker.caches.open("orbit-shell-v5");
    await worker.caches.open("orbit-pages-v1");
    await worker.caches.open("external-cache");

    await dispatchLifecycle(worker.activateHandler);

    expect(await worker.caches.keys()).toEqual(["orbit-shell-v5", "orbit-pages-v1", "external-cache"]);
  });

  it("caches successful navigation responses and reuses them offline", async () => {
    const worker = loadServiceWorker();
    worker.fetchMock.mockResolvedValueOnce(htmlResponse("Dashboard shell"));

    const first = await dispatchFetch(worker, navigationRequest("https://orbit.test/dashboard?from=shortcut"));
    expect(await first.text()).toBe("Dashboard shell");

    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const second = await dispatchFetch(worker, navigationRequest("https://orbit.test/dashboard"));

    expect(await second.text()).toBe("Dashboard shell");
    expect(worker.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the cached dashboard before the static offline page", async () => {
    const worker = loadServiceWorker();
    worker.fetchMock.mockResolvedValueOnce(htmlResponse("Cached dashboard"));

    await dispatchFetch(worker, navigationRequest("https://orbit.test/dashboard"));

    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const response = await dispatchFetch(worker, navigationRequest("https://orbit.test/tasks"));

    expect(await response.text()).toBe("Cached dashboard");
  });

  it("runtime-caches Next static assets with a cache-first strategy", async () => {
    const worker = loadServiceWorker();
    const request = getRequest("https://orbit.test/_next/static/chunks/app.js");
    worker.fetchMock.mockResolvedValueOnce(new Response("chunk-v1"));

    expect(await (await dispatchFetch(worker, request)).text()).toBe("chunk-v1");

    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await (await dispatchFetch(worker, request)).text()).toBe("chunk-v1");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores mobile share target images under the size limits", async () => {
    const worker = loadServiceWorker();
    const response = await dispatchFetch(
      worker,
      shareTargetPostRequest({
        title: "Progress photos",
        text: "June check-in",
        files: [imageFile("front.png", 3 * 1024 * 1024), imageFile("side.png", 3 * 1024 * 1024)]
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://orbit.test/share-target?shareId=share-id");
    expect([...worker.indexedDB.captures.values()]).toMatchObject([
      {
        id: "share-id",
        title: "Progress photos",
        text: "June check-in",
        files: [{ name: "front.png" }, { name: "side.png" }]
      }
    ]);
  });

  it("keeps only the first five mobile share target images", async () => {
    const worker = loadServiceWorker();
    const response = await dispatchFetch(
      worker,
      shareTargetPostRequest({
        files: [
          imageFile("one.png", 1),
          imageFile("two.png", 1),
          imageFile("three.png", 1),
          imageFile("four.png", 1),
          imageFile("five.png", 1),
          imageFile("ignored-too-large.png", 30 * 1024 * 1024)
        ]
      })
    );

    const storedCapture = [...worker.indexedDB.captures.values()][0];

    expect(response.headers.get("location")).toBe("https://orbit.test/share-target?shareId=share-id");
    expect(storedCapture.files).toHaveLength(5);
    expect(storedCapture.files).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "ignored-too-large.png" })]));
  });

  it("limits mobile share target text fields before IndexedDB storage", async () => {
    const worker = loadServiceWorker();
    const response = await dispatchFetch(
      worker,
      shareTargetPostRequest({
        title: "T".repeat(500),
        text: "N".repeat(12000),
        url: `https://orbit.test/${"u".repeat(3000)}`
      })
    );
    const storedCapture = [...worker.indexedDB.captures.values()][0];

    expect(response.headers.get("location")).toBe("https://orbit.test/share-target?shareId=share-id");
    expect(storedCapture.title).toHaveLength(280);
    expect(storedCapture.text).toHaveLength(10000);
    expect(storedCapture.url).toHaveLength(2048);
  });

  it("rejects oversized mobile share target images before browser storage", async () => {
    const worker = loadServiceWorker();
    const response = await dispatchFetch(
      worker,
      shareTargetPostRequest({
        files: [imageFile("huge.png", 11 * 1024 * 1024)]
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://orbit.test/share-target?shareError=too-large");
    expect(worker.indexedDB.captures.size).toBe(0);
  });

  it("rejects mobile share target image groups over the total payload limit", async () => {
    const worker = loadServiceWorker();
    const response = await dispatchFetch(
      worker,
      shareTargetPostRequest({
        files: [imageFile("one.png", 9 * 1024 * 1024), imageFile("two.png", 9 * 1024 * 1024), imageFile("three.png", 9 * 1024 * 1024)]
      })
    );

    expect(response.headers.get("location")).toBe("https://orbit.test/share-target?shareError=too-large");
    expect(worker.indexedDB.captures.size).toBe(0);
  });

  it("shows fallback reminder copy when push payload parsing fails", async () => {
    const worker = loadServiceWorker();

    await dispatchPush(worker, {
      json() {
        throw new Error("bad payload");
      }
    });

    expect(worker.registration.showNotification).toHaveBeenCalledWith("Orbit reminder", {
      body: "A reminder is due.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: "https://orbit.test/dashboard"
      }
    });
  });

  it("sanitizes external push URLs before storing notification data", async () => {
    const worker = loadServiceWorker();

    await dispatchPush(worker, {
      json: () => ({
        title: "Task due",
        body: "Call Ahmed",
        url: "https://example.com/phishing"
      })
    });

    expect(worker.registration.showNotification).toHaveBeenCalledWith(
      "Task due",
      expect.objectContaining({
        body: "Call Ahmed",
        data: {
          url: "https://orbit.test/dashboard"
        }
      })
    );
  });

  it("focuses an existing matching Orbit window on notification click", async () => {
    const worker = loadServiceWorker();
    const matchingClient = {
      url: "https://orbit.test/tasks",
      focus: vi.fn(async () => "focused")
    };
    worker.clients.matchAll.mockResolvedValueOnce([matchingClient]);
    const notification = { close: vi.fn(), data: { url: "/tasks" } };

    await dispatchNotificationClick(worker, notification);

    expect(notification.close).toHaveBeenCalled();
    expect(matchingClient.focus).toHaveBeenCalled();
    expect(worker.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the dashboard instead of an external notification URL", async () => {
    const worker = loadServiceWorker();
    worker.clients.matchAll.mockResolvedValueOnce([]);

    await dispatchNotificationClick(worker, { close: vi.fn(), data: { url: "https://example.com/phishing" } });

    expect(worker.clients.openWindow).toHaveBeenCalledWith("https://orbit.test/dashboard");
  });
});

function loadServiceWorker() {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const caches = createMockCacheStorage();
  const indexedDB = createMockIndexedDb();
  const fetchMock = vi.fn();
  const registration = { showNotification: vi.fn() };
  const clients = {
    claim: vi.fn(),
    matchAll: vi.fn(async (): Promise<MockWindowClient[]> => []),
    openWindow: vi.fn()
  };
  const sandbox: Record<string, unknown> = {
    URL,
    Response,
    caches,
    fetch: fetchMock,
    indexedDB,
    crypto: { randomUUID: () => "share-id" },
    console,
    self: null
  };

  sandbox.self = {
    location: { origin: "https://orbit.test" },
    registration,
    clients,
    skipWaiting: vi.fn(),
    crypto: sandbox.crypto,
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }
  };

  vm.runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), sandbox);

  return {
    caches,
    clients,
    fetchMock,
    indexedDB,
    registration,
    activateHandler: listeners.get("activate")?.[0] ?? (() => {
      throw new Error("Activate handler was not registered.");
    }),
    fetchHandler: getRequiredListener(listeners, "fetch"),
    notificationClickHandler: getRequiredListener(listeners, "notificationclick"),
    pushHandler: getRequiredListener(listeners, "push")
  };
}

function getRequiredListener(listeners: Map<string, Array<(event: any) => void>>, type: string) {
  return listeners.get(type)?.[0] ?? (() => {
    throw new Error(`${type} handler was not registered.`);
  });
}

async function dispatchLifecycle(handler: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) {
  const promises: Array<Promise<unknown>> = [];
  handler({
    waitUntil(promise) {
      promises.push(Promise.resolve(promise));
    }
  });
  await Promise.all(promises);
}

async function dispatchFetch(worker: ReturnType<typeof loadServiceWorker>, request: Record<string, unknown>): Promise<Response> {
  const event: { request: Record<string, unknown>; responsePromise: Promise<Response> | null; respondWith: (promise: Promise<Response>) => void } = {
    request,
    responsePromise: null,
    respondWith(promise: Promise<Response>) {
      event.responsePromise = Promise.resolve(promise);
    }
  };

  worker.fetchHandler(event);

  if (!event.responsePromise) throw new Error("Fetch handler did not call respondWith.");
  return event.responsePromise;
}

async function dispatchPush(worker: ReturnType<typeof loadServiceWorker>, data: { json: () => unknown }) {
  await dispatchWaitUntil(worker.pushHandler, { data });
}

async function dispatchNotificationClick(worker: ReturnType<typeof loadServiceWorker>, notification: { close: () => void; data?: unknown }) {
  await dispatchWaitUntil(worker.notificationClickHandler, { notification });
}

async function dispatchWaitUntil(handler: (event: any) => void, eventShape: Record<string, unknown>) {
  const promises: Array<Promise<unknown>> = [];
  handler({
    ...eventShape,
    waitUntil(promise: Promise<unknown>) {
      promises.push(Promise.resolve(promise));
    }
  });
  await Promise.all(promises);
}

function navigationRequest(url: string) {
  return { method: "GET", mode: "navigate", url };
}

function getRequest(url: string) {
  return { method: "GET", mode: "same-origin", url };
}

function shareTargetPostRequest(fields: Record<string, unknown>) {
  const formData = {
    get(name: string) {
      const value = fields[name];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
    getAll(name: string) {
      const value = fields[name];
      if (Array.isArray(value)) return value;
      return value == null ? [] : [value];
    }
  };

  return {
    method: "POST",
    mode: "navigate",
    url: "https://orbit.test/share-target",
    formData: vi.fn(async () => formData)
  };
}

function imageFile(name: string, size: number, type = "image/png") {
  return {
    name,
    size,
    type,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(0))
  };
}

function htmlResponse(body: string) {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function createMockIndexedDb() {
  const storeNames = new Set<string>();
  const captures = new Map<string, MockStoredCapture>();

  function createObjectStore(tx?: MockIdbTransaction): MockIdbObjectStore {
    return {
      put(payload: MockStoredCapture) {
        captures.set(payload.id, payload);
      },
      openCursor() {
        const request: MockIdbRequest<MockIdbCursor | null> = {};
        const values = [...captures.values()];
        let index = 0;

        function finish() {
          request.result = null;
          request.onsuccess?.();
          tx?.oncomplete?.();
        }

        function cursorFor(value: MockStoredCapture): MockIdbCursor {
          return {
            value,
            delete() {
              captures.delete(value.id);
            },
            continue() {
              index += 1;
              const next = values[index];
              queueMicrotask(() => {
                if (next) {
                  request.result = cursorFor(next);
                  request.onsuccess?.();
                  return;
                }
                finish();
              });
            }
          };
        }

        queueMicrotask(() => {
          const first = values[index];
          if (first) {
            request.result = cursorFor(first);
            request.onsuccess?.();
            return;
          }
          finish();
        });

        return request;
      },
      get(id: string) {
        const request: MockIdbRequest<MockStoredCapture | undefined> = {};
        queueMicrotask(() => {
          request.result = captures.get(id);
          request.onsuccess?.();
        });
        return request;
      },
      delete(id: string) {
        captures.delete(id);
      }
    };
  }

  const db = {
    objectStoreNames: {
      contains(name: string) {
        return storeNames.has(name);
      }
    },
    createObjectStore(name: string) {
      storeNames.add(name);
      return createObjectStore();
    },
    transaction(_storeName: string, _mode: string): MockIdbTransaction {
      const tx: MockIdbTransaction = {
        objectStore: () => createObjectStore(tx)
      };
      return tx;
    },
    close: vi.fn()
  };

  return {
    captures,
    open(_name: string, _version: number) {
      const request: MockIdbRequest<typeof db> = {};
      queueMicrotask(() => {
        request.result = db;
        if (!storeNames.has("shared-captures")) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

function createMockCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();

  function storeFor(name: string) {
    const existing = stores.get(name);
    if (existing) return existing;
    const store = new Map<string, Response>();
    stores.set(name, store);
    return store;
  }

  function cacheFor(store: Map<string, Response>) {
    return {
      async addAll(paths: string[]) {
        for (const path of paths) {
          store.set(path, new Response(`cached ${path}`));
        }
      },
      async match(input: unknown) {
        return store.get(cacheKey(input))?.clone();
      },
      async put(input: unknown, response: Response) {
        store.set(cacheKey(input), response.clone());
      }
    };
  }

  return {
    async open(name: string) {
      return cacheFor(storeFor(name));
    },
    async match(input: unknown) {
      for (const store of stores.values()) {
        const match = store.get(cacheKey(input));
        if (match) return match.clone();
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    }
  };
}

function cacheKey(input: unknown) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "url" in input && typeof input.url === "string") return input.url;
  throw new Error("Unsupported cache key.");
}
