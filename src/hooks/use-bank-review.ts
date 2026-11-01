import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api";
import { getApi } from "@/lib/backend";
import { bankSmsApi, type BankTransaction } from "@/lib/bank-sms";
import type { FinanceCategory } from "@/lib/types";

// Bank messages waiting for a decision. Saving goes through the dashboard's `act` because a confirmed purchase adds an expense.
export function useBankReview(act: (write: () => PromiseLike<unknown>) => Promise<void>) {
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await bankSmsApi.toReview(getApi()));
      setFailed(false);
    } catch (error) {
      // 404: a server from before this feature, so there is nothing to review and nothing wrong.
      setFailed(!(error instanceof ApiError && error.status === 404));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const confirm = (row: BankTransaction, category?: FinanceCategory) => act(() => bankSmsApi.confirm(getApi(), row.id, category)).then(load);
  const ignore = (row: BankTransaction) => act(() => bankSmsApi.ignore(getApi(), row.id)).then(load);

  return { items, failed, load, confirm, ignore };
}
