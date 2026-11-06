import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AiPicker } from "@/components/ai-picker";
import { Icon, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useAiChoices } from "@/hooks/use-ai-choices";
import { loadAskConsent, saveAskConsent } from "@/hooks/use-ask-consent";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useVoice } from "@/hooks/use-voice";
import { apiQuickAdd } from "@/lib/api-actions";
import { askGate, serverDetail } from "@/lib/ask";
import { ACT_HISTORY_TURNS, ACT_TEXT_MAX, actBody, actionRows, applyActions, instantDraft, kindName, opName, type ActReply, type ActTurn } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import { captureStarters, digits, formatDate, isArabic, t } from "@/lib/i18n";
import type { QuickAddDraft } from "@/lib/quick-add";
import { aiName, aiQuery } from "@/lib/integrations";
import { isNoAiError } from "@/lib/morning-brief";
import { parseNatural } from "@/lib/quick-add-input";
import { defaultVoiceLang, withSpoken, type VoiceLang } from "@/lib/voice";

const recentKey = "orbit.quick-add.recent";

const kinds: Record<QuickAddDraft["kind"], [en: string, ar: string]> = {
  task: ["Task", "مهمة"], reminder: ["Reminder", "تذكير"], capture: ["Note", "ملاحظة"], meal: ["Meal", "وجبة"], mealPlan: ["Meal plan", "خطة وجبة"], grocery: ["Grocery", "مشتريات"],
  workout: ["Workout", "تمرين"], weight: ["Weight", "وزن"], sleep: ["Sleep", "نوم"], expense: ["Expense", "مصروف"],
  bill: ["Bill", "فاتورة"], habit: ["Habit", "عادة"]
};

function draftFields(draft: QuickAddDraft) {
  const rows: [string, string][] = [[isArabic ? "العنوان" : "Title", draft.title]];
  if (draft.amount) rows.push([isArabic ? "المبلغ" : "Amount", `${draft.amount} ${draft.currency}`]);
  // The guessed category is shown, so a wrong guess is seen before saving.
  if (draft.kind === "expense") rows.push([isArabic ? "الفئة" : "Category", t.financeCategoryNames[draft.financeCategory]]);
  if (draft.sleepMinutes) rows.push([isArabic ? "المدة" : "Duration", digits(`${Math.round((draft.sleepMinutes / 60) * 10) / 10}h`)]);
  else if (draft.durationMinutes) rows.push([isArabic ? "المدة" : "Duration", `${draft.durationMinutes} ${t.min}`]);
  if (draft.weight && draft.kind === "weight") rows.push([t.weight, `${draft.weight} ${draft.unit}`]);
  if (draft.calories) rows.push([t.calories, `${draft.calories} ${t.kcal}`]);
  if (draft.at) rows.push([isArabic ? "الموعد" : "Due", formatDate(draft.at, { weekday: "short", hour: "numeric", minute: "2-digit" })]);
  if (draft.priority === "high") rows.push([isArabic ? "الأولوية" : "Priority", t.high]);
  return rows;
}

// The Orbit assistant, opened from the button in the middle of the tab bar and from any screen. Type or speak, in
// Arabic or English. A plain quick-add line is saved at once with no AI; anything else goes to the person's own AI,
// which prepares the changes, and nothing is saved until the person confirms them here.
export default function Capture() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { data, refresh, userId } = useDashboardData();
  const { toast } = useOverlays();
  const ai = useAiChoices("assistant");
  const [text, setText] = useState(params.text ?? "");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [forceAi, setForceAi] = useState(false);
  const [history, setHistory] = useState<ActTurn[]>([]);
  const [answer, setAnswer] = useState<ActReply | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<string | null | undefined>(undefined);
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(defaultVoiceLang(isArabic));
  const beforeVoice = useRef("");
  const voice = useVoice((spoken) => setText(withSpoken(beforeVoice.current, spoken)));
  const options = { defaultWeightUnit: data.profile?.weight_unit ?? "kg", defaultCurrency: data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR" };
  const provider = ai.choices ? aiName(ai.choices, ai.current) : null;
  const instant = !forceAi && !answer ? instantDraft(text, options) : null;
  // No AI connected: the old quick add, where anything else becomes a task.
  const fallback = !provider && !instant && text.trim() ? parseNatural(text, options) : null;
  const parsed = instant ?? fallback;
  const gate = provider === null ? "no-ai" : askGate(provider, accepted);
  const chosen = answer ? answer.actions.filter((_, index) => !skipped.has(index)) : [];

  useEffect(() => {
    AsyncStorage.getItem(recentKey)
      .then((saved) => setRecent(saved ? JSON.parse(saved) : []))
      .catch(() => undefined);
    void loadAskConsent(userId).then(setAccepted);
  }, [userId]);

  const remember = (line: string) =>
    void AsyncStorage.setItem(recentKey, JSON.stringify([line, ...recent.filter((item) => item !== line)].slice(0, 5))).catch(() => undefined);

  const done = (message: string) => {
    void refresh();
    toast(message);
    router.back();
  };

  async function quickAdd() {
    if (!parsed?.validation.ok || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await apiQuickAdd(getApi(), parsed.draft);
      remember(text.trim());
      done(t.saved);
    } catch (error) {
      setFailure(`${t.couldNotAdd}: ${error instanceof Error ? error.message : t.tryAgain}`);
      setBusy(false);
    }
  }

  async function askAssistant() {
    const line = text.trim();
    if (!line || busy || !provider) return;
    if (gate !== "ready") return;
    setBusy(true);
    setFailure(null);
    try {
      const reply = await getApi().post<ActReply>(`/assistant/act${aiQuery(ai.current)}`, actBody(line, history, isArabic ? "ar" : "en"));
      remember(line);
      setHistory((turns) => [...turns, { role: "user" as const, content: line }, { role: "assistant" as const, content: reply.reply }].slice(-ACT_HISTORY_TURNS));
      setAnswer(reply);
      setSkipped(new Set());
      setText("");
    } catch (error) {
      setFailure(`${t.assistantFailed} ${serverDetail(error, isArabic)}`.trim());
      if (isNoAiError(error)) void ai.reload();
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!chosen.length || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await applyActions(getApi(), chosen);
    setBusy(false);
    if (!result.failed.length) return done(t.assistantSaved);
    void refresh();
    // Keep only what failed, so trying again never saves a change twice.
    setAnswer({ reply: t.assistantSomeFailed, actions: result.failed.map((item) => item.action) });
    setSkipped(new Set());
    setFailure(result.failed.map((item) => `${item.action.label}: ${isArabic ? t.tryAgain : item.message}`).join("\n"));
  }

  const agree = async () => {
    if (!provider) return;
    try {
      await saveAskConsent(userId, provider);
      setAccepted(await loadAskConsent(userId));
    } catch {
      setFailure(t.askAgreeFailed);
    }
  };

  const submit = () => (instant || fallback ? quickAdd() : askAssistant());
  const toggleVoice = () => {
    if (voice.listening) return voice.stop();
    beforeVoice.current = text;
    void voice.start(voiceLang);
  };
  const startOver = () => {
    setAnswer(null);
    setHistory([]);
    setForceAi(false);
    setFailure(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>{t.assistantTitle}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <Text style={[type.pill, { fontSize: 14, color: colors.onShellMuted }]}>{t.cancel}</Text>
        </Pressable>
      </View>

      <AiPicker choices={ai.choices} value={ai.current} onChange={ai.setPicked} onShell />

      {answer ? (
        <View style={styles.preview}>
          <Text style={[type.body, styles.auto]}>{answer.reply}</Text>
          {answer.actions.length ? <Text style={type.tileLabel}>{t.assistantCheck}</Text> : null}
          {answer.actions.map((action, index) => {
            const off = skipped.has(index);
            return (
              <View key={`${action.kind}-${action.id ?? "new"}-${index}`} style={[styles.action, off && { opacity: 0.45 }]}>
                <View style={styles.previewHead}>
                  <View style={[styles.previewMark, action.op === "delete" && { backgroundColor: colors.accentTint }]}>
                    <Icon name={action.op === "delete" ? "trash-2" : action.op === "complete" ? "check" : action.op === "update" ? "edit-2" : "plus"} size={14} color={colors.urgentInk} />
                  </View>
                  <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>
                    {opName(action.op, isArabic)} · {kindName(action.kind, isArabic)}
                  </Text>
                  <Pressable
                    onPress={() => setSkipped((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={[type.pill, { color: colors.inkMuted }]}>{off ? t.assistantKeep : t.assistantSkip}</Text>
                  </Pressable>
                </View>
                <Text style={[type.barValue, styles.auto]}>{action.label}</Text>
                {actionRows(action, isArabic).map(([key, value]) => (
                  <View key={key} style={styles.field}>
                    <Text style={[type.rowSubtitle, { fontSize: 13 }]}>{key}</Text>
                    <Text style={[type.barValue, { flexShrink: 1, fontSize: 13, textAlign: "right" }]}>{value}</Text>
                  </View>
                ))}
              </View>
            );
          })}
          {answer.actions.length ? (
            <Button
              title={busy ? t.assistantThinking : chosen.length === 1 ? t.assistantConfirmOne : t.assistantConfirm.replace("{n}", digits(chosen.length))}
              variant="primary"
              disabled={busy || !chosen.length}
              onPress={() => void confirm()}
            />
          ) : null}
          <Button title={t.assistantNew} variant="outline" disabled={busy} onPress={startOver} />
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, parsed && !parsed.validation.ok && { borderColor: colors.accentDeep }]}
          autoFocus={!answer}
          multiline
          placeholder={answer ? t.askPlaceholder : t.assistantPh}
          placeholderTextColor={colors.inkFaint}
          selectionColor={colors.accentDeep}
          value={text}
          onChangeText={setText}
          maxLength={ACT_TEXT_MAX}
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submit()}
          returnKeyType="send"
          editable={!busy && !voice.listening}
        />
        <Pressable onPress={toggleVoice} accessibilityRole="button" accessibilityLabel={voice.listening ? t.micStop : t.micStart} style={[styles.mic, voice.listening && { backgroundColor: colors.accent }]}>
          <Icon name={voice.listening ? "square" : "mic"} size={20} color={voice.listening ? colors.accentInk : colors.ink} />
        </Pressable>
      </View>
      <View style={styles.chips}>
        {(["ar-SA", "en-US"] as const).map((lang) => (
          <Pressable key={lang} onPress={() => setVoiceLang(lang)} accessibilityRole="tab" accessibilityState={{ selected: voiceLang === lang }} style={[styles.chip, voiceLang === lang && styles.chipOn]}>
            <Icon name="mic" size={11} color={voiceLang === lang ? colors.urgentInk : colors.inkMuted} />
            <Text style={[type.barLabel, voiceLang === lang && { color: colors.urgentInk }]}>{lang === "ar-SA" ? t.voiceArabic : t.voiceEnglish}</Text>
          </Pressable>
        ))}
        {voice.listening ? <Text style={[type.shellMeta, { alignSelf: "center" }]}>{t.micListening}</Text> : null}
      </View>
      {voice.error ? <Text style={[type.shellMuted, { color: colors.dangerOnShell }]}>{voice.error}</Text> : null}

      {!answer && !text.trim() ? (
        <View style={styles.chips}>
          {captureStarters.map((word) => (
            <Pressable key={word} onPress={() => setText(word)} accessibilityRole="button" style={styles.chip}>
              <Text style={type.barLabel}>{word.trim()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {parsed ? (
        <View style={styles.preview}>
          <View style={styles.previewHead}>
            <View style={styles.previewMark}>
              <Icon name="check-circle" size={15} color={colors.urgentInk} />
            </View>
            <Text style={type.tileLabel}>{instant ? t.assistantInstant : t.preview}</Text>
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
          {instant && provider ? (
            <Pressable onPress={() => setForceAi(true)} accessibilityRole="button" hitSlop={6}>
              <Text style={[type.pill, { color: colors.accentDeep }]}>{t.assistantUseAi}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!parsed && text.trim() && gate === "consent" ? (
        <View style={styles.preview}>
          <Text style={type.title}>{t.askConsentTitle}</Text>
          <Text style={type.body}>{t.assistantConsentBody.replace("{provider}", provider ?? "")}</Text>
          <Button variant="primary" title={t.askAgree} onPress={() => void agree()} />
        </View>
      ) : null}

      {!provider && ai.choices ? (
        <Pressable onPress={() => router.push("/integrations")} accessibilityRole="link" style={styles.note}>
          <Icon name="cpu" size={14} color={colors.onShellMuted} />
          <Text style={[type.shellMuted, { flex: 1 }]}>{t.assistantNoAi}</Text>
        </Pressable>
      ) : !answer && !text.trim() ? (
        <Text style={type.shellMuted}>{t.assistantHint}</Text>
      ) : null}

      {!answer && !text.trim() && recent.length ? (
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

      {failure ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.dangerOnShell }}>{failure}</Text> : null}

      {parsed ? (
        <Button title={busy ? t.connecting : t.save} variant="primary" disabled={!parsed.validation.ok || busy} onPress={() => void quickAdd()} />
      ) : text.trim() && gate === "ready" ? (
        <Button title={busy ? t.assistantThinking : t.assistantSend} variant="primary" disabled={busy} onPress={() => void askAssistant()} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.onShell },
  auto: { writingDirection: "auto" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.hairline },
  chipOn: { backgroundColor: colors.urgent },
  action: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  note: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  input: { flex: 1, maxHeight: 140, paddingTop: 14, paddingBottom: 14, textAlignVertical: "top", writingDirection: "auto", minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, backgroundColor: colors.field, fontFamily: fonts.medium, fontSize: 17, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceInset },
  preview: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewMark: { width: 28, height: 28, borderRadius: radius.control, backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  missing: { backgroundColor: colors.accentTint, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8 },
  recent: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: radius.control },
  recentText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink }
});
