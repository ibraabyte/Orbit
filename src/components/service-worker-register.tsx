"use client";

import { useEffect, useRef } from "react";
import {
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
  cleanupDevelopmentServiceWorker,
  registerServiceWorker,
  shouldAutoRegisterServiceWorker,
  shouldCheckServiceWorkerUpdate,
  updateServiceWorkerRegistration
} from "@/lib/push";

export function ServiceWorkerRegister() {
  const lastUpdateCheckAt = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAutoRegisterServiceWorker()) {
      cleanupDevelopmentServiceWorker().catch(() => {
        // Local cleanup is best effort; stale service workers can be removed manually from browser settings.
      });
      return;
    }

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const checkForUpdate = () => {
      if (!registration) return;
      const now = Date.now();
      if (!shouldCheckServiceWorkerUpdate(lastUpdateCheckAt.current, now)) return;
      lastUpdateCheckAt.current = now;
      updateServiceWorkerRegistration(registration).catch(() => {
        // Update checks can fail offline or in unsupported browsers.
      });
    };

    registerServiceWorker()
      .then((nextRegistration) => {
        if (cancelled) return;
        registration = nextRegistration;
        checkForUpdate();
      })
      .catch(() => {
        // Registration can fail during local development or unsupported browsers.
      });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
