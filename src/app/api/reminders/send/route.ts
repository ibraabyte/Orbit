import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { cronAuthorizationStatus } from "@/lib/cron-auth";
import { isExpiredPushSubscriptionError } from "@/lib/push-delivery";
import { buildDueReminderNotifications, buildReminderPushPayload, markReminderNotificationDelivered, shouldMarkNotificationDelivered } from "@/lib/reminder-notifications";
import type { Database } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return sendDueReminders(request);
}

export async function GET(request: NextRequest) {
  return sendDueReminders(request);
}

async function sendDueReminders(request: NextRequest) {
  const authorizationStatus = cronAuthorizationStatus({
    authorization: request.headers.get("authorization"),
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV
  });

  if (authorizationStatus === "missing-secret") {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  if (authorizationStatus === "unsafe-secret") {
    return NextResponse.json({ error: "Unsafe CRON_SECRET" }, { status: 500 });
  }

  if (authorizationStatus === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!url || !serviceRole || !publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "Missing server push configuration" }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createClient<Database>(url, serviceRole, {
    auth: {
      persistSession: false
    }
  });

  const now = new Date().toISOString();
  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("status", "scheduled")
    .lte("remind_at", now)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", now)
    .limit(50);

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  const notifications = buildDueReminderNotifications({
    reminders: reminders ?? [],
    tasks: tasks ?? [],
    now: new Date(now)
  });
  const subscriptionsByUser = new Map<string, NonNullable<Awaited<ReturnType<typeof loadSubscriptions>>>>();
  let sent = 0;
  let deliveredNotifications = 0;
  let deliveryMarkFailures = 0;
  let failedDeliveries = 0;
  let subscriptionsChecked = 0;
  let notificationsWithoutSubscriptions = 0;
  let subscriptionLoadFailures = 0;
  let subscriptionCleanupFailures = 0;
  const failedSubscriptions = new Set<string>();
  const expiredSubscriptions = new Set<string>();

  for (const notification of notifications) {
    const subscriptions = subscriptionsByUser.get(notification.userId) ?? (await loadSubscriptions(notification.userId));
    subscriptionsByUser.set(notification.userId, subscriptions);
    subscriptionsChecked += subscriptions.length;
    if (!subscriptions.length) notificationsWithoutSubscriptions += 1;

    const deliveryResults = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          const payload = buildReminderPushPayload(notification);
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            },
            JSON.stringify(payload)
          );
          return true;
        } catch (error) {
          failedDeliveries += 1;
          if (isExpiredPushSubscriptionError(error)) {
            expiredSubscriptions.add(subscription.id);
          } else {
            failedSubscriptions.add(subscription.id);
          }
          return false;
        }
      })
    );

    const successfulDeliveries = deliveryResults.filter(Boolean).length;
    sent += successfulDeliveries;
    if (!shouldMarkNotificationDelivered(successfulDeliveries)) continue;

    const sentAt = new Date().toISOString();
    const markResult = await markReminderNotificationDelivered(supabase, notification, sentAt);
    if (markResult.marked) {
      deliveredNotifications += 1;
    } else {
      deliveryMarkFailures += 1;
    }
  }

  const expiredSubscriptionIds = [...expiredSubscriptions];
  if (expiredSubscriptionIds.length) {
    const { error: cleanupError } = await supabase.from("push_subscriptions").delete().in("id", expiredSubscriptionIds);
    if (cleanupError) subscriptionCleanupFailures += expiredSubscriptionIds.length;
  }

  return NextResponse.json(
    {
      notifications: notifications.length,
      reminders: notifications.filter((notification) => notification.kind === "reminder").length,
      taskReminders: notifications.filter((notification) => notification.kind === "task").length,
      deliveredNotifications,
      deliveryMarkFailures,
      sent,
      failedDeliveries,
      subscriptionsChecked,
      notificationsWithoutSubscriptions,
      failedSubscriptions: failedSubscriptions.size,
      subscriptionLoadFailures,
      subscriptionCleanupFailures,
      removedSubscriptions: subscriptionCleanupFailures ? 0 : expiredSubscriptionIds.length
    },
    { status: deliveryMarkFailures || subscriptionLoadFailures || subscriptionCleanupFailures || failedSubscriptions.size ? 500 : 200 }
  );

  async function loadSubscriptions(userId: string) {
    const { data, error } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
    if (error) {
      subscriptionLoadFailures += 1;
      return [];
    }
    return data ?? [];
  }
}
