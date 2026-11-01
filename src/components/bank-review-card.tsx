import { Text } from "react-native";
import { Badge, Card, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { canConfirm, isPossibleDuplicate, isSpending, type BankTransaction } from "@/lib/bank-sms";
import { financeCategories, formatMoney } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import type { FinanceCategory } from "@/lib/types";

// Bank messages that count for nothing until decided here. Hidden when there is nothing to decide.
export function BankReviewCard({
  items,
  failed,
  confirm,
  ignore
}: {
  items: BankTransaction[];
  failed: boolean;
  confirm: (row: BankTransaction, category?: FinanceCategory) => Promise<void>;
  ignore: (row: BankTransaction) => Promise<void>;
}) {
  const { sheet, toast } = useOverlays();
  if (!items.length && !failed) return null;

  const accept = (row: BankTransaction, category?: FinanceCategory) => confirm(row, category).then(() => toast(t.bankConfirmed));
  const open = (row: BankTransaction) =>
    sheet({
      title: row.merchant ?? t.bankNames[row.bank],
      detail: `${t.bankNames[row.bank]} · ${t.bankKinds[row.kind]}${canConfirm(row) ? "" : ` · ${t.bankUnclearHint}`}`,
      options: [
        ...(canConfirm(row) && isSpending(row)
          ? financeCategories.map((category) => ({ label: `${t.bankConfirmAs} ${t.financeCategoryNames[category]}`, run: () => void accept(row, category) }))
          : canConfirm(row)
            ? [{ label: t.bankConfirm, run: () => void accept(row) }]
            : []),
        { label: t.bankIgnore, destructive: true, run: () => void ignore(row) }
      ]
    });

  return (
    <Card title={t.toReview} action={items.length ? <Badge tone="urgent">{items.length}</Badge> : undefined}>
      {failed ? <Text style={type.rowSubtitle}>{t.error}</Text> : null}
      {items.map((row) => (
        <ListRow
          key={row.id}
          title={row.merchant ?? t.bankNames[row.bank]}
          badges={
            <>
              {row.kind !== "purchase" ? <Badge>{t.bankKinds[row.kind]}</Badge> : null}
              {isPossibleDuplicate(row) ? <Badge tone="urgent" glyph="!">{t.bankPossibleDuplicate}</Badge> : null}
              {row.amount === null ? <Badge tone="urgent" glyph="!">{t.bankUnclear}</Badge> : null}
            </>
          }
          subtitle={[
            ...(row.merchant ? [t.bankNames[row.bank]] : []),
            formatDate(row.received_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
            ...(isSpending(row) ? [t.financeCategoryNames[row.category]] : [])
          ].join(" · ")}
          meta={row.amount !== null && row.currency ? formatMoney(row.amount, row.currency) : undefined}
          onPress={() => open(row)}
          trailing={canConfirm(row) ? <RowButton label={t.bankConfirm} onPress={() => void accept(row)} /> : <RowButton outline label={t.bankIgnore} onPress={() => void ignore(row)} />}
        />
      ))}
    </Card>
  );
}
