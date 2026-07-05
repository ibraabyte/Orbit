export type OfflineStatus = {
  online: boolean;
  queuedCount: number;
  queueReadable: boolean;
};

export function shouldShowOfflineStatus(status: OfflineStatus) {
  return !status.online || status.queuedCount > 0 || !status.queueReadable;
}

export function offlineStatusTone(status: OfflineStatus) {
  return status.queueReadable ? "warning" : "danger";
}

export function offlineStatusCopy(status: OfflineStatus) {
  if (!status.queueReadable) {
    return {
      title: "Offline queue unavailable",
      detail: "Local capture storage could not be read on this device."
    };
  }

  if (!status.online && status.queuedCount > 0) {
    return {
      title: "Offline",
      detail: `${status.queuedCount} capture${status.queuedCount === 1 ? "" : "s"} waiting to sync when you reconnect.`
    };
  }

  if (!status.online) {
    return {
      title: "Offline",
      detail: "Recently opened pages and the cached dashboard can still load."
    };
  }

  return {
    title: "Offline captures waiting",
    detail: `${status.queuedCount} capture${status.queuedCount === 1 ? "" : "s"} waiting to sync.`
  };
}
