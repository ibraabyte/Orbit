import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Card, EmptyState, Icon, ListRow, MoreButton, TrendBars, type } from "@/components/drift";
import { Chip } from "@/components/exercise-ui";
import { toDateKey, useOverlays } from "@/components/overlays";
import { BleedRow, Button, Input, Loading, Screen, Segments } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { digits, formatDate, t } from "@/lib/i18n";
import { amountText, bodyTrends, changeText, kindHistory, MEASUREMENT_KINDS, parseNumber, spread, trainingApi, tt, unitsFor, type BodyMeasurement, type LengthUnit, type Trend, type WeightUnit } from "@/lib/training";
import type { WeightLog } from "@/lib/types";

type Kind = Trend["kind"];
const KINDS: Kind[] = ["weight", ...MEASUREMENT_KINDS];
const day = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });

// Body measurements: weight (the same weigh-ins as Health and quick add), waist, chest, arms and the rest,
// each with its latest number, the change since the first one, and a small chart.
export default function Body() {
  const { toast, pickDate } = useOverlays();
  const { refresh } = useDashboardData();
  const [measurements, setMeasurements] = useState<BodyMeasurement[] | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("waist");
  const [units, setUnits] = useState<Record<string, string>>({ weight: "kg", length: "cm" });
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [open, setOpen] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const api = getApi();
      const [rows, logs] = await Promise.all([trainingApi.measurements(api), api.get<WeightLog[]>("/weight-logs?limit=500")]);
      setMeasurements(rows);
      setWeights(logs);
      // New entries start in the unit you used last.
      setUnits((current) => ({ weight: logs[0]?.unit ?? current.weight, length: rows.find((row) => row.unit !== "%")?.unit ?? current.length }));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const unitKey = kind === "weight" ? "weight" : kind === "body_fat" ? null : "length";
  const unit = unitKey ? units[unitKey] : "%";

  const add = async () => {
    const number = parseNumber(value);
    if (!number) return toast(tt.badValue);
    setBusy(true);
    try {
      // Noon on the picked day, so the date reads the same in every time zone.
      const at = date === toDateKey(new Date()) ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
      if (kind === "weight") {
        await trainingApi.addWeight(getApi(), number, unit as WeightUnit, at);
        void refresh();
      } else await trainingApi.addMeasurement(getApi(), { kind, value: number, unit: unit as LengthUnit | "%", measured_at: at });
      setValue("");
      toast(tt.logged);
      await load();
    } catch (addError) {
      toast(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setBusy(false);
    }
  };

  const remove = (entryKind: Kind, id: string) =>
    Alert.alert(tt.deleteEntryTitle, undefined, [
      {
        text: tt.deleteEntry,
        style: "destructive",
        onPress: () =>
          void (entryKind === "weight" ? trainingApi.removeWeight(getApi(), id).then(() => refresh()) : trainingApi.removeMeasurement(getApi(), id))
            .then(load)
            .catch((removeError: unknown) => toast(removeError instanceof Error ? removeError.message : String(removeError)))
      },
      { text: t.cancel, style: "cancel" }
    ]);

  const pickDay = async () => {
    const picked = await pickDate(tt.addMeasurement, date);
    if (picked) setDate(picked);
  };

  const trends = measurements ? bodyTrends(measurements, weights) : [];

  return (
    <Screen refreshing={loading && Boolean(measurements)} onRefresh={() => void load()}>
      <Card title={tt.addMeasurement}>
        <BleedRow>
          {KINDS.map((item) => (
            <Chip key={item} label={tt.kinds[item]} on={kind === item} onPress={() => setKind(item)} />
          ))}
        </BleedRow>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Input style={{ flex: 1 }} value={value} onChangeText={setValue} placeholder={`${tt.kinds[kind]} (${unit})`} keyboardType="decimal-pad" onSubmitEditing={() => void add()} returnKeyType="done" />
          {unitKey ? <Segments small options={unitsFor(kind)} value={unit} onChange={(next) => setUnits((current) => ({ ...current, [unitKey]: next }))} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Chip label={formatDate(`${date}T12:00:00`, { weekday: "short", day: "numeric", month: "short" })} icon="calendar" on={false} onPress={() => void pickDay()} />
          <View style={{ flex: 1 }}>
            <Button variant="primary" title={t.save} disabled={busy || !value.trim()} onPress={() => void add()} />
          </View>
        </View>
      </Card>

      {!measurements ? (
        loading ? <Loading /> : <EmptyState>{error ?? tt.couldNotLoad}</EmptyState>
      ) : !trends.length ? (
        <EmptyState icon="maximize">{tt.noMeasurements}</EmptyState>
      ) : (
        <>
          <Text style={[type.shellMuted, { paddingHorizontal: 4 }]}>{tt.tapForHistory}</Text>
          {trends.map((trend) => (
            <TrendCard key={trend.kind} trend={trend} open={open === trend.kind} onToggle={() => setOpen(open === trend.kind ? null : trend.kind)} rows={open === trend.kind ? kindHistory(trend.kind, measurements, weights) : []} onRemove={(id) => remove(trend.kind, id)} />
          ))}
        </>
      )}
    </Screen>
  );
}

const trim1 = (value: number) => String(Math.round(value * 10) / 10);

function TrendCard({ trend, open, onToggle, rows, onRemove }: { trend: Trend; open: boolean; onToggle: () => void; rows: { id: string; value: number; unit: string; at: string }[]; onRemove: (id: string) => void }) {
  const change = changeText(trend.change, trend.latest.unit);
  const toggle = (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${tt.kinds[trend.kind]}, ${tt.entries(trend.count)}`} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={type.hint}>{tt.entries(trend.count)}</Text>
      <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />
    </Pressable>
  );
  return (
    <Card title={tt.kinds[trend.kind]} action={toggle}>
      <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View style={{ gap: 2, minWidth: 120 }}>
          <Text style={type.stat}>
            {digits(trim1(trend.latest.value))} <Text style={type.rowSubtitle}>{trend.latest.unit}</Text>
          </Text>
          <Text style={type.rowSubtitle}>{change ? `${change} · ${tt.since(day(trend.firstAt))}` : day(trend.latest.at)}</Text>
        </View>
        {trend.points.length > 1 ? (
          <View style={{ flex: 1 }}>
            <TrendBars values={spread(trend.points)} height={44} label={`${tt.kinds[trend.kind]}: ${digits(trend.points.join(", "))}`} highlight={trend.points.length - 1} />
          </View>
        ) : null}
      </Pressable>
      {open ? rows.map((row) => <ListRow key={row.id} title={amountText(row.value, row.unit)} subtitle={day(row.at)} trailing={<MoreButton label={tt.deleteEntry} onPress={() => onRemove(row.id)} />} />) : null}
    </Card>
  );
}
