import type { ApiClient } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { FinanceCategory } from "@/lib/types";

// Bank messages sent by the iPhone Shortcut (backend/BANK_SMS.md). Shapes mirror backend/app/routers/bank_sms.py.

export type BankCode = "rajhi" | "alinma" | "stc" | "d360" | "barq" | "snb";
export type BankKind = "purchase" | "fee" | "refund" | "transfer_in" | "transfer_out" | "card_payment" | "cash_withdrawal" | "unknown";
export type BankTransaction = {
  id: string;
  // Null when the Shortcut didn't say which bank (the ready Shortcut sends only the message).
  bank: BankCode | null;
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
export type BankSmsSettings = { ai_read: boolean; ai_available: boolean };
// Each value as written in the pasted example; wildcards are words that change (a name, a greeting).
export type TemplateFields = { amount: string; currency: string; merchant: string | null; card_last4: string | null; reference: string | null; wildcards: string[] };
export type TemplateKind = Exclude<BankKind, "unknown">;
export type TemplatePreview = { fields: TemplateFields; kind: TemplateKind; words: string[] };
export type BankTemplate = { id: string; label: string; kind: TemplateKind; bank: BankCode | null; pattern: string; created_at: string; last_matched_at: string | null };
export type NewTemplate = { example: string; label: string; kind: TemplateKind; bank: BankCode | null; fields: TemplateFields };

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;

export const bankSmsApi = {
  status: (api: Api) => api.get<BankSmsStatus>("/bank-sms/status"),
  newToken: (api: Api) => api.post<{ token: string }>("/bank-sms/token"),
  revokeToken: (api: Api) => api.delete("/bank-sms/token"),
  toReview: (api: Api) => api.get<BankTransaction[]>("/bank-sms/transactions?status=needs_review"),
  confirm: (api: Api, id: string, category?: FinanceCategory) =>
    api.patch<BankTransaction>(`/bank-sms/transactions/${id}/review`, category ? { status: "confirmed", category } : { status: "confirmed" }),
  ignore: (api: Api, id: string) => api.patch<BankTransaction>(`/bank-sms/transactions/${id}/review`, { status: "ignored" }),
  preview: (api: Api, example: string) => api.post<TemplatePreview>("/bank-sms/templates/preview", { example }),
  templates: (api: Api) => api.get<BankTemplate[]>("/bank-sms/templates"),
  createTemplate: (api: Api, body: NewTemplate) => api.post<BankTemplate>("/bank-sms/templates", body),
  deleteTemplate: (api: Api, id: string) => api.delete(`/bank-sms/templates/${encodeURIComponent(id)}`),
  settings: (api: Api) => api.get<BankSmsSettings>("/bank-sms/settings"),
  setAi: (api: Api, on: boolean) => api.patch<BankSmsSettings>("/bank-sms/settings", { ai_read: on })
};

// The signed Shortcut the API serves; opening it on the phone imports it into Shortcuts.
export const shortcutUrl = (base: string) => `${base.replace(/\/+$/, "")}/bank-sms/shortcut`;

export const isReadByAi = (row: BankTransaction) => row.review_reasons.includes("read_by_ai");

export const bankName = (row: { bank: BankCode | null }) => (row.bank ? t.bankNames[row.bank] : t.bankSms);

// Same rule the server enforces: an unread amount or an unknown message can only be ignored.
export const canConfirm = (row: BankTransaction) => row.amount !== null && row.currency !== null && row.kind !== "unknown";

// Only these become expenses; the category is meaningless for the rest.
export const isSpending = (row: BankTransaction) => row.kind === "purchase" || row.kind === "fee";

export const isPossibleDuplicate = (row: BankTransaction) => row.review_reasons.includes("possible_duplicate");
