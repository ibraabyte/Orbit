import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { readFolds, toggleFold, type FoldKey, type Folds } from "@/lib/finance-hub";

/** Which sections of a screen are open, remembered on the phone. */
export function useFolds(storageKey: string) {
  const [folds, setFolds] = useState<Folds>({});

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((saved) => setFolds(readFolds(saved)))
      .catch(() => undefined);
  }, [storageKey]);

  const toggle = (key: FoldKey, needsYou: boolean) => {
    const next = toggleFold(folds, key, needsYou);
    setFolds(next);
    void AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
  };

  return { folds, toggle };
}
