import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { defaultLayout, moveCard, normalizeLayout, withHidden, type TodayCard, type TodayLayout } from "@/lib/today-layout";

// v2 came with the 2026-11 design: its order starts fresh, the cards hidden before stay hidden.
const key = "orbit.today.layout.v2";
const oldKeys = ["orbit.today.layout", "orbit.today.hidden"];

// One copy for the whole app, so Today changes the moment the Customize sheet does.
let current: TodayLayout = defaultLayout;
let ready = false;
const listeners = new Set<() => void>();

function set(next: TodayLayout) {
  current = next;
  listeners.forEach((listener) => listener());
}

function save(next: TodayLayout) {
  set(next);
  void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
}

const loading = (async () => {
  try {
    const saved = await AsyncStorage.getItem(key);
    if (saved) current = normalizeLayout(JSON.parse(saved));
    else
      for (const old of oldKeys) {
        const value = await AsyncStorage.getItem(old);
        if (value) {
          // Only cards that look the same as before keep being hidden; the redesigned ones show again.
          const same: TodayCard[] = ["brief", "dayplan", "digest", "meds", "workout", "week"];
          current = { ...defaultLayout, hidden: normalizeLayout(JSON.parse(value)).hidden.filter((card) => same.includes(card)) };
          break;
        }
      }
  } catch {
    // A broken saved value falls back to the default order with nothing hidden.
  }
  ready = true;
  set(current);
})();

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loading;
  return () => listeners.delete(listener);
}

/** Today's card order and hidden cards (ready once the saved choice is read), and the two ways to change them. */
export function useTodayLayout() {
  const layout = useSyncExternalStore(subscribe, () => current);
  const isReady = useSyncExternalStore(subscribe, () => ready);
  return {
    layout,
    ready: isReady,
    shown: (card: TodayCard) => !layout.hidden.includes(card),
    setShown: (card: TodayCard, shown: boolean) => save(withHidden(current, card, !shown)),
    move: (card: TodayCard, by: -1 | 1) => save({ ...current, order: moveCard(current.order, card, by) })
  };
}
