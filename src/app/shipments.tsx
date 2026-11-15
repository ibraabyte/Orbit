import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Share, Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, type } from "@/components/drift";
import { FormButtons } from "@/components/money-form";
import { useOverlays, type SheetOption } from "@/components/overlays";
import { Button, Input, Loading, Screen, ui } from "@/components/screen";
import { GmailCard } from "@/components/gmail-card";
import { TrackingCard } from "@/components/tracking-card";
import { useNow } from "@/hooks/use-now";
import { getApi, hasServer } from "@/lib/backend";
import { formatDate } from "@/lib/i18n";
import { detailText, flagLabels, groupShipments, looksLikeNumber, rowLine, rowMeta, shipmentsApi, shipmentTitle, sx, type Shipment, type ShipmentsOverview } from "@/lib/shipments";

const ICONS: Partial<Record<Shipment["status"], "package" | "truck" | "check-circle" | "alert-triangle" | "map-pin">> = {
  delivered: "check-circle",
  out_for_delivery: "truck",
  pickup: "map-pin",
  failed: "alert-triangle",
  exception: "alert-triangle",
  expired: "alert-triangle"
};

// Shipments: tracking numbers you follow (typed in, or found in shipping emails), through your own 17TRACK account.
// What is late or stuck comes first, then what is on its way, then what arrived.
export default function Shipments() {
  const onServer = hasServer();
  const { sheet, toast } = useOverlays();
  const now = useNow();
  const [overview, setOverview] = useState<ShipmentsOverview | null>(null);
  const [loading, setLoading] = useState(onServer);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Shipment | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    if (!onServer) return;
    setLoading(true);
    try {
      setOverview(await shipmentsApi.overview(getApi()));
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

  const check = async () => {
    setChecking(true);
    try {
      setOverview(await shipmentsApi.refresh(getApi()));
      setError(null);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setChecking(false);
    }
  };

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast(message);
      await load();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError));
    }
  };

  const add = async () => {
    if (!looksLikeNumber(number)) {
      setError(sx.badNumber);
      return;
    }
    setAdding(true);
    try {
      await shipmentsApi.add(getApi(), number, label);
      setNumber("");
      setLabel("");
      toast(sx.added);
      await load();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setAdding(false);
    }
  };

  const open = (shipment: Shipment) => {
    const options: SheetOption[] = [
      { label: sx.shareNumber, run: () => void Share.share({ message: shipment.number }) },
      {
        label: sx.rename,
        run: () => {
          setRenaming(shipment);
          setName(shipment.label ?? "");
        }
      },
      { label: sx.hide, destructive: true, run: () => void act(() => shipmentsApi.hide(getApi(), shipment.id), sx.hidden) }
    ];
    sheet({ title: shipmentTitle(shipment), detail: detailText(shipment, now), options });
  };

  const saveName = () => {
    if (!renaming) return;
    const shipment = renaming;
    setRenaming(null);
    void act(() => shipmentsApi.rename(getApi(), shipment.id, name), sx.added);
  };

  if (!onServer || (!overview && !loading)) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        <EmptyState icon="package">{error ?? sx.nothingYet}</EmptyState>
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

  const groups = groupShipments(overview.shipments);
  const checked = overview.tracking.refreshed_at ? sx.lastCheck(formatDate(overview.tracking.refreshed_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) : null;
  const checkLine = [checked, overview.gmail.connected && overview.scanned_at ? sx.emailsRead(overview.emails_read) : null].filter(Boolean).join(" · ");
  const waiting = !overview.tracking.connected && overview.shipments.length > 0;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Card>
        <Text style={type.rowSubtitle}>{sx.intro}</Text>
        <View style={{ gap: 8 }}>
          <Input accessibilityLabel={sx.numberPh} placeholder={sx.numberPh} value={number} onChangeText={setNumber} autoCapitalize="characters" autoCorrect={false} style={{ writingDirection: "ltr" }} />
          <Input accessibilityLabel={sx.labelPh} placeholder={sx.labelPh} value={label} onChangeText={setLabel} maxLength={80} />
          <Button title={adding ? sx.adding : sx.add} disabled={adding || !number.trim()} onPress={() => void add()} />
        </View>
        {overview.shipments.length ? <Button variant="outline" title={checking ? sx.refreshing : sx.refresh} disabled={checking} onPress={() => void check()} /> : null}
        {checkLine ? <Text style={type.rowSubtitle}>{checkLine}</Text> : null}
        {waiting ? <Text style={ui.error}>{sx.trackingNeeded}</Text> : null}
        {overview.email_error ? <Text style={ui.error}>{overview.email_error}</Text> : null}
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </Card>

      {renaming ? (
        <Card title={shipmentTitle(renaming)}>
          <View style={{ gap: 8 }}>
            <Input placeholder={sx.renamePh} value={name} onChangeText={setName} maxLength={80} autoFocus />
            <FormButtons onCancel={() => setRenaming(null)} onSave={saveName} />
          </View>
        </Card>
      ) : null}

      {!overview.shipments.length ? <EmptyState icon="package">{sx.nothingYet}</EmptyState> : null}

      <ShipmentList title={sx.needsLook} shipments={groups.needsLook} now={now} onOpen={open} />
      <ShipmentList title={sx.coming} shipments={groups.coming} now={now} onOpen={open} />
      <ShipmentList title={sx.arrived} shipments={groups.arrived} now={now} onOpen={open} muted />

      <TrackingCard status={overview.tracking} onChange={load} />
      <GmailCard status={overview.gmail} onChange={load} returnPath="shipments" />
    </Screen>
  );
}

function ShipmentList({ title, shipments, now, onOpen, muted }: { title: string; shipments: Shipment[]; now: Date; onOpen: (shipment: Shipment) => void; muted?: boolean }) {
  if (!shipments.length) return null;
  return (
    <Card title={title}>
      {shipments.map((shipment, index) => {
        const flags = flagLabels(shipment);
        const urgent = flags.some((flag) => flag.urgent);
        return (
          <ListRow
            key={shipment.id}
            first={index === 0}
            leading={<IconTile name={ICONS[shipment.status] ?? "package"} tone={urgent && !muted ? "urgent" : shipment.status === "out_for_delivery" ? "accent" : "neutral"} />}
            title={shipmentTitle(shipment)}
            badges={
              flags.length || shipment.source === "email" ? (
                <>
                  {flags.map((flag) => (
                    <Badge key={flag.flag} tone={flag.urgent ? "urgent" : "neutral"} glyph={flag.urgent ? "!" : undefined}>
                      {flag.label}
                    </Badge>
                  ))}
                  {shipment.source === "email" && !flags.length ? <Badge>{sx.fromEmail}</Badge> : null}
                </>
              ) : undefined
            }
            subtitle={[rowMeta(shipment), rowLine(shipment, now)].filter(Boolean).join("\n")}
            onPress={() => onOpen(shipment)}
            chevron
          />
        );
      })}
    </Card>
  );
}
