const expiredSubscriptionStatuses = new Set([404, 410]);

type PushDeliveryError = {
  statusCode?: unknown;
  status?: unknown;
};

export function pushDeliveryErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const deliveryError = error as PushDeliveryError;
  const status = deliveryError.statusCode ?? deliveryError.status;
  return typeof status === "number" ? status : null;
}

export function isExpiredPushSubscriptionError(error: unknown) {
  const status = pushDeliveryErrorStatus(error);
  return status !== null && expiredSubscriptionStatuses.has(status);
}
