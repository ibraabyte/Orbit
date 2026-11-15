import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Chips } from "@/components/chips";
import { Card, type } from "@/components/drift";
import { Chip } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import {
  DEFAULT_REMIND,
  DOCUMENT_KINDS,
  documentBody,
  documentFormFrom,
  documentsApi,
  dx,
  emptyDocumentForm,
  fromGregorian,
  fromHijri,
  hijriAvailable,
  hijriText,
  readParts,
  REMIND_CHOICES,
  toggleRemind,
  toHijri,
  type DateParts,
  type DocumentForm
} from "@/lib/documents";
import { digits, formatDate, t } from "@/lib/i18n";

type Calendar = "gregorian" | "hijri";
type Typed = { day: string; month: string; year: string };

const gregorianText = (key: string) => formatDate(`${key}T12:00:00`, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function partsOf(key: string | null, calendar: Calendar): Typed {
  if (!key) return { day: "", month: "", year: "" };
  const parts: DateParts | null = calendar === "hijri" ? toHijri(key) : { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), day: Number(key.slice(8, 10)) };
  return parts ? { day: digits(parts.day), month: digits(parts.month), year: digits(parts.year) } : { day: "", month: "", year: "" };
}

function Field({ label, detail, children }: { label: string; detail?: string | null; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.rowSubtitle}>{label}</Text>
      {children}
      {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
    </View>
  );
}

// Add or change a document: its kind, whose it is, the expiry (typed in Gregorian or Hijri, as printed on the paper),
// and when to be reminded.
export default function DocumentEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, act } = useDashboardData();
  const { pickDate, toast } = useOverlays();
  const existing = useMemo(() => (id ? (data.documents.find((document) => document.id === id) ?? null) : null), [id, data.documents]);
  const [form, setForm] = useState<DocumentForm>(() => (existing ? documentFormFrom(existing) : emptyDocumentForm()));
  const hijriOn = hijriAvailable();
  // Saudi IDs and iqamas print the Hijri date first, so those start in Hijri.
  const [calendar, setCalendar] = useState<Calendar>(() => (hijriOn && (form.kind === "national_id" || form.kind === "iqama") ? "hijri" : "gregorian"));
  const [typed, setTyped] = useState<Typed>(() => partsOf(form.expiresOn, calendar));
  const [saving, setSaving] = useState(false);
  const set = (changes: Partial<DocumentForm>) => setForm((current) => ({ ...current, ...changes }));

  // A new paper of another kind takes that kind's usual heads-ups, until the person picks their own.
  const [remindTouched, setRemindTouched] = useState(Boolean(existing));
  const pickKind = (kind: DocumentForm["kind"]) => set({ kind, ...(remindTouched ? {} : { remindDays: DEFAULT_REMIND[kind] }) });

  const type_ = (changes: Partial<Typed>) => {
    const next = { ...typed, ...changes };
    setTyped(next);
    const parts = readParts(next.day, next.month, next.year);
    set({ expiresOn: parts ? (calendar === "hijri" ? fromHijri(parts) : fromGregorian(parts)) : null });
  };
  const switchCalendar = (next: Calendar) => {
    setCalendar(next);
    setTyped(partsOf(form.expiresOn, next));
  };
  const pickOnCalendar = async () => {
    const picked = await pickDate(dx.expiry, form.expiresOn);
    if (!picked) return;
    set({ expiresOn: picked });
    setTyped(partsOf(picked, calendar));
  };

  const complete = typed.day.trim() && typed.month.trim() && typed.year.trim().length >= 4;
  // The same day in the other calendar, so a typo shows at once.
  const other = form.expiresOn ? (calendar === "hijri" ? dx.gregorianIs(gregorianText(form.expiresOn)) : hijriOn ? dx.hijriIs(hijriText(form.expiresOn) ?? "") : null) : complete ? dx.noSuchDay : null;

  const save = async () => {
    const result = documentBody(form);
    if ("error" in result) return toast(result.error);
    setSaving(true);
    const ok = await act(() => (existing ? documentsApi.update(getApi(), existing.id, result.body) : documentsApi.add(getApi(), result.body)));
    setSaving(false);
    if (ok) {
      toast(dx.saved);
      router.back();
    }
  };

  const remove = () =>
    existing &&
    Alert.alert(dx.deleteTitle, dx.deleteBody, [
      {
        text: dx.delete,
        style: "destructive",
        onPress: () =>
          void act(() => documentsApi.remove(getApi(), existing.id)).then((ok) => {
            if (!ok) return;
            toast(dx.deleted);
            router.back();
          })
      },
      { text: t.cancel, style: "cancel" }
    ]);

  const dateInput = (key: keyof Typed, label: string, width: number) => (
    <View style={{ flex: width, gap: 4 }}>
      <Text style={type.tileLabel}>{label}</Text>
      <Input value={typed[key]} onChangeText={(value) => type_({ [key]: value })} keyboardType="number-pad" maxLength={key === "year" ? 4 : 2} placeholder={key === "year" ? (calendar === "hijri" ? digits(1450) : digits(2030)) : digits(key === "day" ? 15 : 3)} accessibilityLabel={`${dx.expiry}, ${label}`} style={{ textAlign: "center" }} />
    </View>
  );

  return (
    <Screen title={existing ? dx.edit : dx.add}>
      <Card style={{ gap: 14 }}>
        <Field label={dx.kind}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DOCUMENT_KINDS.map((kind) => (
              <Chip key={kind} label={dx.kinds[kind]} on={form.kind === kind} onPress={() => pickKind(kind)} />
            ))}
          </View>
        </Field>
        <Field label={form.kind === "other" ? dx.name : dx.nameOptional}>
          <Input value={form.name} onChangeText={(name) => set({ name })} placeholder={form.kind === "other" ? dx.namePh : dx.kinds[form.kind]} maxLength={80} accessibilityLabel={dx.name} />
        </Field>
        <Field label={dx.holder} detail={dx.holderDetail}>
          <Input value={form.holder} onChangeText={(holder) => set({ holder })} placeholder={dx.holderPh} maxLength={60} accessibilityLabel={dx.holder} />
        </Field>
      </Card>

      <Card title={dx.expiry} style={{ gap: 12 }}>
        {hijriOn ? <Chips options={["hijri", "gregorian"] as Calendar[]} value={calendar} onChange={switchCalendar} label={(option) => (option === "hijri" ? dx.hijri : dx.gregorian)} /> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {dateInput("day", dx.day, 1)}
          {dateInput("month", dx.month, 1)}
          {dateInput("year", dx.year, 1.4)}
        </View>
        {other ? <Text style={type.rowSubtitle}>{other}</Text> : null}
        <Button variant="outline" title={dx.pickOnCalendar} onPress={() => void pickOnCalendar()} />
      </Card>

      <Card title={dx.remind} style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REMIND_CHOICES.map((day) => (
            <Chip
              key={day}
              label={dx.remindChoice(day)}
              on={form.remindDays.includes(day)}
              onPress={() => {
                setRemindTouched(true);
                set({ remindDays: toggleRemind(form.remindDays, day) });
              }}
            />
          ))}
        </View>
        <Text style={type.rowSubtitle}>{dx.remindDetail}</Text>
      </Card>

      <Card style={{ gap: 14 }}>
        <Field label={dx.notes} detail={dx.noNumber}>
          <Input value={form.notes} onChangeText={(notes) => set({ notes })} placeholder={dx.notesPh} maxLength={300} accessibilityLabel={dx.notes} />
        </Field>
      </Card>

      <Button variant="primary" title={dx.save} disabled={saving} onPress={() => void save()} />
      {existing ? <Button variant="outline" title={dx.delete} onPress={remove} /> : null}
    </Screen>
  );
}
