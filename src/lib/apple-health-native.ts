import { Platform } from "react-native";
import type { ApiClient } from "@/lib/api";
import { appleHealthApi, hasData, localKey, sleepByDay, workoutsByDay, type AppleHealthDay, type AppleHealthStatus } from "@/lib/apple-health";

// The HealthKit part. Only a native iOS build has it (npx expo run:ios); Expo Go, Android and the web get null.
type Kit = typeof import("@kingstinct/react-native-healthkit");

function load(): Kit | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kit = require("@kingstinct/react-native-healthkit") as Kit;
    return kit.isHealthDataAvailable() ? kit : null;
  } catch {
    return null;
  }
}

const kit = load();
export const appleHealthAvailable = kit !== null;

// Read-only: Orbit never asks to write to Health.
const READ = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierBodyMass",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKWorkoutTypeIdentifier"
] as const;

// asleepUnspecified, asleepCore, asleepDeep, asleepREM. In bed and awake don't count as sleep.
const ASLEEP = new Set([1, 3, 4, 5]);

/** Shows Apple's permission sheet the first time; after that it returns at once. */
export async function requestAppleHealth() {
  if (!kit) return false;
  return kit.requestAuthorization({ toRead: READ });
}

const round = (value: number | undefined, places = 0) => (value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(places)));

/** The last `days` local days, oldest first. Daily totals come from HealthKit's statistics, which already
 * de-duplicate between the iPhone, the Watch and other apps. */
export async function readAppleHealth(days = 14): Promise<AppleHealthDay[]> {
  if (!kit) return [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const filter = { date: { startDate: start, endDate: now } };

  const daily = async (identifier: (typeof READ)[number], option: "cumulativeSum" | "discreteAverage" | "mostRecent", unit: string) => {
    const rows = await kit.queryStatisticsCollectionForQuantity(identifier as never, [option], start, { day: 1 }, { filter, unit: unit as never });
    const pick = option === "cumulativeSum" ? "sumQuantity" : option === "discreteAverage" ? "averageQuantity" : "mostRecentQuantity";
    return new Map(rows.filter((row) => row.startDate && row[pick]).map((row) => [localKey(row.startDate as Date), row[pick]!.quantity]));
  };

  const [steps, kcal, resting, heart, hrv, weight, sleep, workouts] = await Promise.all([
    daily("HKQuantityTypeIdentifierStepCount", "cumulativeSum", "count"),
    daily("HKQuantityTypeIdentifierActiveEnergyBurned", "cumulativeSum", "kcal"),
    daily("HKQuantityTypeIdentifierRestingHeartRate", "discreteAverage", "count/min"),
    daily("HKQuantityTypeIdentifierHeartRate", "discreteAverage", "count/min"),
    daily("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "discreteAverage", "ms"),
    daily("HKQuantityTypeIdentifierBodyMass", "mostRecent", "kg"),
    // The first night starts the evening before the first day.
    kit.queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { limit: 0, filter: { date: { startDate: new Date(start.getTime() - 12 * 3600_000), endDate: now } } }),
    kit.queryWorkoutSamples({ limit: 0, filter })
  ]);

  const asleep = sleepByDay(sleep.filter((sample) => ASLEEP.has(Number(sample.value))).map((sample) => ({ start: sample.startDate, end: sample.endDate })));
  const trained = workoutsByDay(workouts.map((workout) => ({ start: workout.startDate, end: workout.endDate })));

  const result: AppleHealthDay[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = localKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset));
    result.push({
      date,
      steps: round(steps.get(date)),
      active_kcal: round(kcal.get(date)),
      sleep_minutes: asleep.get(date) ?? null,
      workouts: trained.get(date)?.count ?? null,
      workout_minutes: trained.get(date)?.minutes ?? null,
      resting_hr: round(resting.get(date), 1),
      average_hr: round(heart.get(date), 1),
      hrv_sdnn: round(hrv.get(date), 1),
      weight_kg: round(weight.get(date), 1)
    });
  }
  return result;
}

// ponytail: in-memory throttle, so opening Health a few times doesn't re-read HealthKit each time.
const EVERY = 15 * 60_000;
let lastSync = 0;

/** Reads the last two weeks and sends the days with something in them. null: nothing to send (no data or denied). */
export async function syncAppleHealth(api: Pick<ApiClient, "get" | "put" | "delete">, { force = false } = {}): Promise<AppleHealthStatus | null> {
  if (!kit || (!force && Date.now() - lastSync < EVERY)) return null;
  await requestAppleHealth();
  const days = (await readAppleHealth()).filter(hasData);
  lastSync = Date.now();
  return days.length ? appleHealthApi.save(api, days) : null;
}
