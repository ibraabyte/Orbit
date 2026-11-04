import { useOverlays } from "@/components/overlays";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import type { Bill } from "@/lib/types";
import { cardLabel } from "@/lib/wealth";

/** Opens a sheet to pick which card a subscription is charged to (or none). */
export function useCardPicker() {
  const { data, act } = useDashboardData();
  const { sheet, toast } = useOverlays();
  return (bill: Bill) =>
    sheet({
      title: `${t.pickCard} · ${bill.name}`,
      options: [
        ...data.cards.map((card) => ({ label: `${card.id === bill.card_id ? "● " : ""}${cardLabel(card)}`, run: () => void act(() => apiUpdate(getApi(), "/bills", bill.id, { card_id: card.id })).then(() => toast(t.saved)) })),
        { label: `${bill.card_id ? "" : "● "}${t.noCard}`, run: () => void act(() => apiUpdate(getApi(), "/bills", bill.id, { card_id: null })).then(() => toast(t.saved)) }
      ]
    });
}
