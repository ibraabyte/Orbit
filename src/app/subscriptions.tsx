import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, StatGrid, StatTile, type } from "@/components/drift";
import { FormButtons } from "@/components/money-form";
import { useOverlays, type SheetOption } from "@/components/overlays";
import { Button, Input, Loading, Screen, ui } from "@/components/screen";
import { GmailCard } from "@/components/gmail-card";
import { getApi, hasServer } from "@/lib/backend";
import { formatDate } from "@/lib/i18n";
import {
  datesLine,
  flagLabels,
  groupFinds,
  hunterApi,
  parsePrice,
  priceOnly,
  rowLine,
  rowPrice,
  priceLine,
  sourcesLine,
  st,
  totalsParts,
  type HunterOverview,
  type SubscriptionFind
} from "@/lib/subscriptions";

// Finds what keeps charging you (expenses, bank SMS, Gmail receipts) and lets you act on each one:
// open the service's cancel page, keep it, add it to your bills, or say it isn't a subscription.
export default function Subscriptions() {
  const onServer = hasServer();
  const { sheet, toast } = useOverlays();
  const [overview, setOverview] = useState<HunterOverview | null>(null);
  const [loading, setLoading] = useState(onServer);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<SubscriptionFind | null>(null);
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    if (!onServer) return;
    setLoading(true);
    try {
      setOverview(await hunterApi.overview(getApi()));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [onServer]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const scan = async () => {
    setScanning(true);
    try {
      setOverview(await hunterApi.scan(getApi()));
      setError(null);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setScanning(false);
    }
  };

  const act = async (action: () => Promise<unknown>, message = st.marked) => {
    try {
      await action();
      toast(message);
      await load();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError));
    }
  };

  const decide = (find: SubscriptionFind, status: "new" | "kept" | "cancelled" | "dismissed") => act(() => hunterApi.decide(getApi(), find.id, status));

  const track = (find: SubscriptionFind) => {
    if (find.amount === null) {
      setPricing(find);
      setPrice("");
      return;
    }
    void act(() => hunterApi.track(getApi(), find.id), st.added);
  };

  const cancel = async (find: SubscriptionFind) => {
    await WebBrowser.openBrowserAsync(find.cancel_url);
    // Back from the page: one tap to remember it.
    sheet({
      title: st.didCancel,
      detail: find.name,
      options: [
        { label: st.yesCancelled, run: () => void decide(find, "cancelled") },
        { label: st.notYet, run: () => undefined }
      ]
    });
  };

  const open = (find: SubscriptionFind) => {
    const options: SheetOption[] = [{ label: find.cancel_is_search ? st.howToCancel : st.cancelIt, run: () => void cancel(find) }];
    if (find.status === "new" || find.status === "cancelled") options.push({ label: st.keep, run: () => void decide(find, "kept") });
    if (find.status !== "tracked" && !find.bill_id) options.push({ label: st.addToBills, run: () => track(find) });
    if (find.status === "new") options.push({ label: st.notSub, run: () => void decide(find, "dismissed") });
    if (find.status !== "new") options.push({ label: st.undo, run: () => void decide(find, "new") });
    const detail = [priceLine(find), datesLine(find), sourcesLine(find), find.evidence ? `“${find.evidence}”` : null].filter(Boolean).join("\n");
    sheet({ title: find.name, detail, options });
  };

  const savePrice = () => {
    const amount = parsePrice(price);
    if (!pricing || amount === null) return;
    const find = pricing;
    setPricing(null);
    void act(() => hunterApi.track(getApi(), find.id, amount, find.currency ?? "SAR"), st.added);
  };

  if (!onServer || (!overview && !loading)) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <EmptyState icon="search">{error ?? st.nothingYet}</EmptyState>
      </Screen>
    );
  }
  if (!overview) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <Loading />
      </Screen>
    );
  }

  const groups = groupFinds(overview.finds);
  const running = totalsParts(overview.monthly);
  const forgotten = totalsParts(overview.untracked_monthly);
  const scanned = overview.scanned_at ? st.lastScan(formatDate(overview.scanned_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) : null;
  const scanLine = [scanned, overview.gmail.connected && overview.scanned_at ? st.emailsRead(overview.emails_read) : null].filter(Boolean).join(" · ");

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Card>
        <Text style={type.rowSubtitle}>{st.intro}</Text>
        {overview.finds.length ? (
          <StatGrid columns={2}>
            <StatTile label={st.running} value={running.main || "–"} size={17} />
            <StatTile label={st.notInBills} value={forgotten.main || "–"} size={17} alert={Boolean(forgotten.main)} />
          </StatGrid>
        ) : null}
        {running.rest || forgotten.rest ? <Text style={type.rowSubtitle}>{[running.rest && `${st.running} ${running.rest}`, forgotten.rest && `${st.notInBills} ${forgotten.rest}`].filter(Boolean).join(" · ")}</Text> : null}
        <Button title={scanning ? st.scanning : overview.scanned_at ? st.scanAgain : st.scan} disabled={scanning} onPress={() => void scan()} />
        {scanLine ? <Text style={type.rowSubtitle}>{scanLine}</Text> : null}
        {overview.email_error ? <Text style={ui.error}>{overview.email_error}</Text> : null}
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Card>

      {pricing ? (
        <Card title={pricing.name}>
          <Text style={type.rowSubtitle}>{st.typeAmount}</Text>
          <View style={{ gap: 8 }}>
            <Input placeholder={`${st.amount} · ${pricing.currency ?? "SAR"}`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" autoFocus />
            <FormButtons onCancel={() => setPricing(null)} onSave={savePrice} disabled={parsePrice(price) === null} />
          </View>
        </Card>
      ) : null}

      {overview.scanned_at && !overview.finds.length ? <EmptyState icon="check-circle">{st.nothingFound}</EmptyState> : null}

      <FindList title={st.needsLook} finds={groups.needsLook} onOpen={open} />
      <FindList title={st.keeping} finds={groups.keeping} onOpen={open} />
      <FindList title={st.setAside} finds={groups.setAside} onOpen={open} muted />

      <GmailCard status={overview.gmail} onChange={load} returnPath="subscriptions" />
    </Screen>
  );
}

function FindList({ title, finds, onOpen, muted }: { title: string; finds: SubscriptionFind[]; onOpen: (find: SubscriptionFind) => void; muted?: boolean }) {
  if (!finds.length) return null;
  return (
    <Card title={title}>
      {finds.map((find, index) => {
        const flags = flagLabels(find);
        const was = find.previous_amount !== null && find.currency ? st.priceWas(priceOnly(find.previous_amount, find.currency)) : null;
        return (
          <ListRow
            key={find.id}
            first={index === 0}
            leading={<IconTile name={find.status === "cancelled" ? "x-circle" : find.status === "tracked" ? "check-circle" : "repeat"} tone={flags.some((f) => f.urgent) && !muted ? "urgent" : "neutral"} />}
            title={find.name}
            meta={rowPrice(find)}
            badges={
              !muted && flags.length ? (
                <>
                  {flags.map((f) => (
                    <Badge key={f.flag} tone={f.urgent ? "urgent" : "neutral"} glyph={f.urgent ? "!" : undefined}>
                      {f.label}
                    </Badge>
                  ))}
                </>
              ) : undefined
            }
            subtitle={[rowLine(find), was].filter(Boolean).join(" · ") || null}
            onPress={() => onOpen(find)}
            chevron
          />
        );
      })}
    </Card>
  );
}
