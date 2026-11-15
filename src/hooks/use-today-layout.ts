import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { defaultLayout, moveCard, normalizeLayout, withHidden, type TodayCard, type TodayLayout } from "@/lib/today-layout";

const key = "orbit.today.layout";
const oldHiddenKey = "orbit.today.hidden";

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
    const saved = (await AsyncStorage.getItem(key)) ?? (await AsyncStorage.getItem(oldHiddenKey));
    if (saved) current = normalizeLayout(JSON.parse(saved));
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
