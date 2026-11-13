import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { Card, Chevron, type } from "@/components/drift";
import { Chips } from "@/components/chips";
import { Chip } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { formatDate, t } from "@/lib/i18n";
import { COMMON_TIMES, emptyForm, formBody, formFrom, INTERVAL_HOURS, intervalTimes, medicationsApi, parseTime, rx, SCHEDULES, timeLabel, WEEK_ORDER, type MedicationForm } from "@/lib/medications";

const track = { true: colors.accent, false: colors.hairline };
const dayText = (key: string) => formatDate(`${key}T12:00:00`, { weekday: "short", day: "numeric", month: "short" });

// A label over its field, or a row with a switch.
function Field({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.rowSubtitle}>{label}</Text>
      {children}
      {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
    </View>
  );
}

function SwitchRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.rowTitle}>{label}</Text>
        {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} trackColor={track} thumbColor={colors.ink} value={value} onValueChange={onChange} />
    </View>
  );
}

function DateRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
      <Text style={[type.rowTitle, { flex: 1 }]}>{label}</Text>
      <Text style={type.rowSubtitle}>{value}</Text>
      <Chevron />
    </Pressable>
  );
}

// Add or change a medicine: name and dose, when to take it, an optional course end, and the stock to count down.
export default function MedicationEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, act } = useDashboardData();
  const { pickDate, toast } = useOverlays();
  const existing = useMemo(() => (id ? data.medications.find((medication) => medication.id === id) ?? null : null), [id, data.medications]);
  const [form, setForm] = useState<MedicationForm>(() => (existing ? formFrom(existing) : emptyForm()));
  const [typedTime, setTypedTime] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (changes: Partial<MedicationForm>) => setForm((current) => ({ ...current, ...changes }));

  const toggleTime = (time: string) => set({ times: form.times.includes(time) ? form.times.filter((item) => item !== time) : [...form.times, time].sort() });
  const addTyped = () => {
    const time = parseTime(typedTime);
    if (!time) return toast(rx.badTime);
    if (!form.times.includes(time)) set({ times: [...form.times, time].sort() });
    setTypedTime("");
  };
  const toggleDay = (day: number) => set({ weekdays: form.weekdays.includes(day) ? form.weekdays.filter((item) => item !== day) : [...form.weekdays, day] });

  const pickStart = async () => {
    const picked = await pickDate(rx.startsOn, form.startsOn);
    if (picked) set({ startsOn: picked });
  };
  const pickEnd = async () => {
    const picked = await pickDate(rx.pickEnd, form.endsOn ?? form.startsOn);
    if (picked) set({ endsOn: picked });
  };

  const save = async () => {
    const result = formBody(form);
    if ("error" in result) return toast(result.error);
    setSaving(true);
    const ok = await act(() => (existing ? medicationsApi.update(getApi(), existing.id, result.body) : medicationsApi.add(getApi(), result.body)));
    setSaving(false);
    if (ok) {
      toast(rx.saved);
      router.back();
    }
  };

  const remove = () =>
    existing &&
    Alert.alert(rx.deleteTitle, rx.deleteBody, [
      {
        text: rx.delete,
        style: "destructive",
        onPress: () =>
          void act(() => medicationsApi.remove(getApi(), existing.id)).then((ok) => {
            if (!ok) return;
            toast(rx.deleted);
            router.back();
          })
      },
      { text: t.cancel, style: "cancel" }
    ]);

  // Typed times that aren't quick picks still show, so they can be taken off.
  const timeChoices = [...new Set([...COMMON_TIMES, ...form.times])].sort();

  return (
    <Screen title={existing ? rx.edit : rx.add}>
      <Card style={{ gap: 14 }}>
        <Field label={rx.name}>
          <Input value={form.name} onChangeText={(name) => set({ name })} placeholder={rx.namePh} maxLength={120} accessibilityLabel={rx.name} />
        </Field>
        <Field label={rx.dose}>
          <Input value={form.dose} onChangeText={(dose) => set({ dose })} placeholder={rx.dosePh} maxLength={60} accessibilityLabel={rx.dose} />
        </Field>
      </Card>

      <Card title={rx.when} style={{ gap: 14 }}>
        <Chips options={SCHEDULES} value={form.schedule} onChange={(schedule) => set({ schedule })} label={(option) => rx.schedules[option]} />
        {form.schedule === "weekdays" ? (
          <Field label={rx.days}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {WEEK_ORDER.map((day) => (
                <Chip key={day} label={rx.weekdays[day]} on={form.weekdays.includes(day)} onPress={() => toggleDay(day)} />
              ))}
            </View>
          </Field>
        ) : null}
        {form.schedule === "interval" ? (
          <>
            <Chips options={INTERVAL_HOURS.map(String)} value={String(form.everyHours)} onChange={(hours) => set({ everyHours: Number(hours) })} label={(option) => rx.everyHours(Number(option))} />
            <Field label={rx.firstTime} detail={intervalTimes(form.firstTime, form.everyHours).map(timeLabel).join(" · ")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {COMMON_TIMES.map((time) => (
                  <Chip key={time} label={timeLabel(time)} on={form.firstTime === time} onPress={() => set({ firstTime: time })} />
                ))}
              </View>
            </Field>
          </>
        ) : (
          <Field label={rx.times}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {timeChoices.map((time) => (
                <Chip key={time} label={timeLabel(time)} on={form.times.includes(time)} onPress={() => toggleTime(time)} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Input style={{ flex: 1 }} value={typedTime} onChangeText={setTypedTime} placeholder={rx.timePh} keyboardType="numbers-and-punctuation" returnKeyType="done" onSubmitEditing={addTyped} accessibilityLabel={rx.timePh} />
              <Button variant="outline" title={rx.addTime} onPress={addTyped} />
            </View>
          </Field>
        )}
      </Card>

      <Card title={rx.course} style={{ gap: 6 }}>
        <DateRow label={rx.startsOn} value={dayText(form.startsOn)} onPress={() => void pickStart()} />
        <SwitchRow label={rx.courseOn} detail={rx.courseDetail} value={form.endsOn !== null} onChange={(on) => (on ? void pickEnd() : set({ endsOn: null }))} />
        {form.endsOn ? <DateRow label={rx.endsOn} value={dayText(form.endsOn)} onPress={() => void pickEnd()} /> : null}
      </Card>

      <Card title={rx.stockTitle} style={{ gap: 14 }}>
        <Field label={rx.stock}>
          <Input value={form.stock} onChangeText={(stock) => set({ stock })} placeholder={rx.stockPh} keyboardType="decimal-pad" accessibilityLabel={rx.stock} />
        </Field>
        <Field label={rx.perDose}>
          <Input value={form.perDose} onChangeText={(perDose) => set({ perDose })} keyboardType="decimal-pad" accessibilityLabel={rx.perDose} />
        </Field>
        {form.stock.trim() ? (
          <>
            <SwitchRow label={rx.lowStock} value={form.lowStock} onChange={(lowStock) => set({ lowStock })} />
            {form.lowStock ? (
              <Field label={rx.lowStockAt} detail={rx.lowStockDetail}>
                <Input value={form.lowStockAt} onChangeText={(lowStockAt) => set({ lowStockAt })} keyboardType="decimal-pad" accessibilityLabel={rx.lowStockAt} />
              </Field>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card style={{ gap: 14 }}>
        <Field label={rx.notes}>
          <Input value={form.notes} onChangeText={(notes) => set({ notes })} placeholder={rx.notesPh} maxLength={500} accessibilityLabel={rx.notes} />
        </Field>
        {existing ? <SwitchRow label={rx.paused} detail={rx.pausedDetail} value={form.paused} onChange={(paused) => set({ paused })} /> : null}
      </Card>

      <Button variant="primary" title={rx.save} disabled={saving} onPress={() => void save()} />
      {existing ? <Button variant="outline" title={rx.delete} onPress={remove} /> : null}
    </Screen>
  );
}
