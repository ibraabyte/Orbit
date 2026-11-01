import type { ApiClient } from "@/lib/api";
import type { FinanceCategory } from "@/lib/types";

// Bank messages sent by the iPhone Shortcut (backend/BANK_SMS.md). Shapes mirror backend/app/routers/bank_sms.py.

export type BankCode = "rajhi" | "alinma" | "stc" | "d360" | "barq" | "snb";
export type BankKind = "purchase" | "fee" | "refund" | "transfer_in" | "transfer_out" | "card_payment" | "cash_withdrawal" | "unknown";
export type BankTransaction = {
  id: string;
  bank: BankCode;
  kind: BankKind;
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  card_last4: string | null;
  category: FinanceCategory;
  status: "needs_review" | "confirmed" | "ignored";
  review_reasons: string[];
  received_at: string;
  expense_id: string | null;
};
export type BankSmsStatus = { connected: boolean; created_at: string | null; last_used_at: string | null };

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;

export const bankSmsApi = {
  status: (api: Api) => api.get<BankSmsStatus>("/bank-sms/status"),
  newToken: (api: Api) => api.post<{ token: string }>("/bank-sms/token"),
  revokeToken: (api: Api) => api.delete("/bank-sms/token"),
  toReview: (api: Api) => api.get<BankTransaction[]>("/bank-sms/transactions?status=needs_review"),
  confirm: (api: Api, id: string, category?: FinanceCategory) =>
    api.patch<BankTransaction>(`/bank-sms/transactions/${id}/review`, category ? { status: "confirmed", category } : { status: "confirmed" }),
  ignore: (api: Api, id: string) => api.patch<BankTransaction>(`/bank-sms/transactions/${id}/review`, { status: "ignored" })
};

// Same rule the server enforces: an unread amount or an unknown message can only be ignored.
export const canConfirm = (row: BankTransaction) => row.amount !== null && row.currency !== null && row.kind !== "unknown";

// Only these become expenses; the category is meaningless for the rest.
export const isSpending = (row: BankTransaction) => row.kind === "purchase" || row.kind === "fee";

export const isPossibleDuplicate = (row: BankTransaction) => row.review_reasons.includes("possible_duplicate");
