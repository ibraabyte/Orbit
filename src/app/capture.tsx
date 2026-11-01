import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiQuickAdd } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { captureStarters, formatDate, isArabic, t } from "@/lib/i18n";
import type { QuickAddDraft } from "@/lib/quick-add";
import { parseNatural } from "@/lib/quick-add-input";

const recentKey = "orbit.quick-add.recent";

const kinds: Record<QuickAddDraft["kind"], [en: string, ar: string]> = {
  task: ["Task", "مهمة"], reminder: ["Reminder", "تذكير"], capture: ["Note", "ملاحظة"], meal: ["Meal", "وجبة"], mealPlan: ["Meal plan", "خطة وجبة"], grocery: ["Grocery", "مشتريات"],
  person: ["Person", "شخص"], workout: ["Workout", "تمرين"], weight: ["Weight", "وزن"], sleep: ["Sleep", "نوم"], focus: ["Focus", "تركيز"], expense: ["Expense", "مصروف"],
  bill: ["Bill", "فاتورة"], habit: ["Habit", "عادة"], goal: ["Goal", "هدف"], journal: ["Journal", "يوميات"]
};

function draftFields(draft: QuickAddDraft) {
  const rows: [string, string][] = [[isArabic ? "العنوان" : "Title", draft.title]];
  if (draft.amount) rows.push([isArabic ? "المبلغ" : "Amount", `${draft.amount} ${draft.currency}`]);
  if (draft.sleepMinutes) rows.push([isArabic ? "المدة" : "Duration", `${Math.round((draft.sleepMinutes / 60) * 10) / 10}h`]);
  else if (draft.durationMinutes) rows.push([isArabic ? "المدة" : "Duration", `${draft.durationMinutes} ${t.min}`]);
  if (draft.weight && draft.kind === "weight") rows.push([t.weight, `${draft.weight} ${draft.unit}`]);
  if (draft.calories) rows.push([t.calories, `${draft.calories} ${t.kcal}`]);
  if (draft.at) rows.push([isArabic ? "الموعد" : "Due", formatDate(draft.at, { weekday: "short", hour: "numeric", minute: "2-digit" })]);
  if (draft.priority === "high") rows.push([isArabic ? "الأولوية" : "Priority", t.high]);
  return rows;
}

// One line in, any record out, in plain English or Arabic: a sheet that opens from any screen.
export default function Capture() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { data, refresh } = useDashboardData();
  const { toast } = useOverlays();
  const [text, setText] = useState(params.text ?? "");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const options = { defaultWeightUnit: data.profile?.weight_unit ?? "kg", defaultCurrency: data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR" };
  const parsed = text.trim() ? parseNatural(text, options) : null;
  const ready = Boolean(parsed?.validation.ok) && !busy;

  useEffect(() => {
    AsyncStorage.getItem(recentKey)
      .then((saved) => setRecent(saved ? JSON.parse(saved) : []))
      .catch(() => undefined);
  }, []);

  async function submit() {
    if (!parsed?.validation.ok || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await apiQuickAdd(getApi(), parsed.draft);
      const line = text.trim();
      void AsyncStorage.setItem(recentKey, JSON.stringify([line, ...recent.filter((item) => item !== line)].slice(0, 5))).catch(() => undefined);
      void refresh();
      toast(t.saved);
      router.back();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t.tryAgain);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.shellTop }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>{t.captureTitle}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <Text style={[type.pill, { fontSize: 14, color: colors.onShellMuted }]}>{t.cancel}</Text>
        </Pressable>
      </View>
      <TextInput
        style={[styles.input, parsed && !parsed.validation.ok && { borderColor: colors.accentDeep }]}
        autoFocus
        placeholder={t.capturePh}
        placeholderTextColor={colors.inkFaint}
        selectionColor={colors.accentDeep}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        editable={!busy}
      />
      <View style={styles.chips}>
        {captureStarters.map((word) => (
          <Pressable key={word} onPress={() => setText(word)} accessibilityRole="button" style={styles.chip}>
            <Text style={type.barLabel}>{word.trim()}</Text>
          </Pressable>
        ))}
      </View>
      {parsed ? (
        <View style={styles.preview}>
          <View style={styles.previewHead}>
            <View style={styles.previewMark}>
              <Icon name="check-circle" size={15} color={colors.urgentInk} />
            </View>
            <Text style={type.tileLabel}>{t.preview}</Text>
            <Text style={type.title}>{kinds[parsed.draft.kind][isArabic ? 1 : 0]}</Text>
          </View>
          {parsed.validation.ok
            ? draftFields(parsed.draft).map(([key, value]) => (
                <View key={key} style={styles.field}>
                  <Text style={[type.rowSubtitle, { fontSize: 14 }]}>{key}</Text>
                  <Text style={[type.barValue, { flexShrink: 1, fontSize: 14, textAlign: "right" }]}>{value}</Text>
                </View>
              ))
            : null}
          {parsed.validation.ok ? null : (
            <View style={styles.missing}>
              <Text style={[type.barValue, { color: colors.accentTintInk }]}>△ {parsed.validation.message}</Text>
            </View>
          )}
        </View>
      ) : recent.length ? (
        <View style={{ gap: 6 }}>
          <Text style={type.shellMeta}>{t.recent}</Text>
          {recent.map((line) => (
            <Pressable key={line} onPress={() => setText(line)} accessibilityRole="button" style={styles.recent}>
              <Icon name="rotate-ccw" size={13} color={colors.inkFaint} />
              <Text style={styles.recentText} numberOfLines={1}>
                {line}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {failure ? (
        <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.dangerOnShell }}>
          {t.couldNotAdd}: {failure}
        </Text>
      ) : null}
      <Button title={t.save} variant="primary" disabled={!ready} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.onShell },
  input: { minHeight: 52, paddingHorizontal: 14, borderWidth: 2, borderColor: colors.hairline, borderRadius: radius.card, backgroundColor: colors.surface, fontFamily: fonts.medium, fontSize: 17, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.control, backgroundColor: colors.surface },
  preview: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewMark: { width: 28, height: 28, borderRadius: radius.control, backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  missing: { backgroundColor: colors.accentTint, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8 },
  recent: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: radius.control },
  recentText: { flex: 1, fontFamily: "Menlo", fontSize: 13, color: colors.ink }
});
