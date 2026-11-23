import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { holdListeners, OrbitMark, type HoldListener as Listener } from "@/components/assistant-button";
import { Icon, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { openCapture } from "@/components/screen";
import { colors, fonts, radius, space, textSize, usePalette } from "@/components/theme";
import { loadAskConsent } from "@/hooks/use-ask-consent";
import { useAiChoices } from "@/hooks/use-ai-choices";
import { cloudVoiceAvailable, useCloudVoice } from "@/hooks/use-cloud-voice";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { useVoice } from "@/hooks/use-voice";
import { apiQuickAdd } from "@/lib/api-actions";
import { kindHidden } from "@/lib/app-sections";
import { askGate } from "@/lib/ask";
import { actBody, applyActions, instantDraft, type ActReply } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import { isFoodLine, speechOnPhone } from "@/lib/feature-models";
import { digits, isArabic, t } from "@/lib/i18n";
import { aiName, aiQuery, integrationsApi, type VoiceStatus } from "@/lib/integrations";
import type { QuickAddDraft } from "@/lib/quick-add";
import { defaultVoiceLang, voiceConsented, voiceConsentKey } from "@/lib/voice";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Hold the Orbit button to talk: a dark bar with the voice over the tab bar and the words above it while you speak.
// Letting go sends it. A plain line ("lunch 45") becomes one card at once; anything else goes to the person's AI and
// comes back as a card of changes. Nothing is saved until Save; Edit opens the assistant with the words.
// The button (src/components/assistant-button.tsx) drives it through holdListeners.


type Result = { kind: "draft"; draft: QuickAddDraft } | { kind: "ai"; reply: ActReply };
type Phase = "idle" | "listening" | "thinking" | "result";

const BARS = 14;

export function VoiceHold() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const { data, refresh, userId } = useDashboardData();
  const { hidden } = useSections();
  const { toast } = useOverlays();
  const ai = useAiChoices("assistant");
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const words = useRef("");
  const engine = useRef<"phone" | "cloud" | null>(null);
  const voiceModel = useRef<VoiceStatus | null>(null);
  const voiceConsent = useRef<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const heard = (spoken: string) => {
    words.current = spoken;
    setText(spoken);
  };
  const phone = useVoice((spoken) => heard(spoken));
  const cloud = useCloudVoice((spoken) => heard(spoken));

  useEffect(() => {
    void integrationsApi.voice(getApi()).then((voice) => (voiceModel.current = voice)).catch(() => undefined);
    void AsyncStorage.getItem(voiceConsentKey(userId)).then((saved) => (voiceConsent.current = saved)).catch(() => undefined);
  }, [userId]);

  // The voice bars move while listening.
  useEffect(() => {
    if (phase !== "listening") return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }));
    loop.start();
    const clock = setInterval(() => setSeconds((now) => now + 1), 1000);
    return () => {
      loop.stop();
      pulse.setValue(0);
      clearInterval(clock);
    };
  }, [phase, pulse]);

  const close = () => {
    setPhase("idle");
    setResult(null);
    setText("");
    words.current = "";
  };

  const begin = () => {
    words.current = "";
    setText("");
    setResult(null);
    setSeconds(0);
    setPhase("listening");
    // The voice model when it is on and already agreed to; else the phone (the assistant asks for the agreement).
    const model = voiceModel.current;
    const cloudOk = cloudVoiceAvailable && model?.connected && model.provider && !speechOnPhone(ai.overview) && voiceConsented(voiceConsent.current, model.provider);
    engine.current = cloudOk ? "cloud" : "phone";
    if (cloudOk) void cloud.start(null);
    else void phone.start(defaultVoiceLang(isArabic));
  };

  const finish = async () => {
    if (engine.current === "cloud") await cloud.stop();
    else {
      phone.stop();
      // The phone's last words arrive just after it stops.
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    engine.current = null;
    const line = words.current.trim();
    if (!line) return close();
    setPhase("thinking");
    const options = { defaultWeightUnit: data.profile?.weight_unit ?? "kg", defaultCurrency: data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR" } as const;
    const instant = instantDraft(line, options);
    if (instant?.validation.ok && !kindHidden(instant.draft.kind, hidden)) {
      setResult({ kind: "draft", draft: instant.draft });
      return setPhase("result");
    }
    // The AI, when one is connected and agreed to; anything else is finished in the assistant.
    const choices = ai.choices;
    const lineAi = ai.choiceFor(isFoodLine(line) ? "food_text" : "assistant");
    const provider = choices ? aiName(choices, lineAi) : null;
    const accepted = await loadAskConsent(userId);
    if (askGate(provider, accepted) !== "ready") {
      close();
      return openCapture(line);
    }
    try {
      const reply = await getApi().post<ActReply>(`/assistant/act${aiQuery(lineAi)}`, actBody(line, [], isArabic ? "ar" : "en"));
      if (!reply.actions.length) {
        close();
        return openCapture(line);
      }
      setResult({ kind: "ai", reply });
      setPhase("result");
    } catch {
      close();
      openCapture(line);
    }
  };

  // The button's hold and release, through holdVoice.
  const handlers = useRef({ begin, finish });
  handlers.current = { begin, finish };
  useEffect(() => {
    const listener: Listener = (event) => {
      if (event === "begin") handlers.current.begin();
      else void handlers.current.finish();
    };
    holdListeners.add(listener);
    return () => void holdListeners.delete(listener);
  }, []);

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      if (result.kind === "draft") await apiQuickAdd(getApi(), result.draft);
      else {
        const done = await applyActions(getApi(), result.reply.actions);
        if (done.failed.length) throw new Error(done.failed[0]!.message);
      }
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void refresh();
      toast(t.saved);
      close();
    } catch (error) {
      toast(`${t.couldNotAdd}${error instanceof Error && !isArabic ? `: ${error.message}` : ""}`);
    } finally {
      setSaving(false);
    }
  };

  if (phase === "idle") return null;
  const listening = phase === "listening";
  const bottom = insets.bottom + 18;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={listening ? "none" : "auto"}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={phase === "result" ? close : undefined} accessibilityLabel={t.cancel} />
      {phase === "result" && result ? (
        <View style={[styles.card, { bottom }]}>
          <Text style={[type.rowSubtitle, { fontSize: textSize.footnote }]} numberOfLines={2}>
            «{text}»
          </Text>
          {result.kind === "draft" ? (
            <View style={styles.row}>
              <View style={styles.mark}>
                <Icon name="check" size={18} color={colors.link} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.rowTitle} numberOfLines={2}>
                  {result.draft.title}
                </Text>
                {result.draft.amount ? <Text style={type.rowSubtitle}>{digits(`${result.draft.amount} ${result.draft.currency}`)}</Text> : null}
              </View>
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Text style={type.body}>{result.reply.reply}</Text>
              {result.reply.actions.map((action, index) => (
                <View key={`${action.kind}-${index}`} style={styles.row}>
                  <View style={styles.mark}>
                    <Icon name={action.op === "delete" ? "trash-2" : action.op === "update" ? "edit-2" : action.op === "move" ? "clock" : "plus"} size={16} color={colors.link} />
                  </View>
                  <Text style={[type.rowTitle, { flex: 1 }]} numberOfLines={2}>
                    {action.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.buttons}>
            <Pressable onPress={() => void save()} disabled={saving} accessibilityRole="button" style={({ pressed }) => [styles.save, (pressed || saving) && { opacity: 0.7 }]}>
              <Text style={styles.saveText}>{saving ? "…" : t.save}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const line = text;
                close();
                openCapture(line);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.edit, pressed && { opacity: 0.7 }]}
            >
              <Text style={type.rowTitle}>{t.edit}</Text>
            </Pressable>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t.cancel} style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
              <Icon name="x" size={18} color={colors.inkMuted} />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.words, { bottom: bottom + 92 }]}>
            <Text style={styles.wordsText}>{text || (cloud.transcribing || phase === "thinking" ? "…" : t.micListening)}</Text>
          </View>
          <View style={[styles.bar, { bottom }]}>
            <View style={styles.orb}>
              <OrbitMark size={26} color={palette.accentInk} />
            </View>
            <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no">
              {Array.from({ length: BARS }, (_, index) => {
                const base = 0.35 + 0.65 * Math.abs(Math.sin(index * 1.7));
                // Neighbouring bars move in opposite steps, so the line looks like a voice.
                const scaleY = listening ? pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: index % 2 ? [base, base * 0.4, base] : [base * 0.4, base, base * 0.4] }) : 0.25;
                return <Animated.View key={index} style={[styles.waveBar, { transform: [{ scaleY }] }]} />;
              })}
            </View>
            <Text style={styles.clock}>{phase === "thinking" ? "…" : digits(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(10,10,11,0.28)" },
  words: { position: "absolute", left: space.lg, right: space.lg, padding: space.lg, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.surface, boxShadow: "0 10px 30px rgba(26,26,28,0.12)" },
  wordsText: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 30, color: colors.ink, writingDirection: isArabic ? "rtl" : "ltr" },
  bar: { position: "absolute", left: space.lg, right: space.lg, height: 76, borderRadius: 38, backgroundColor: "#1a1a1c", flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, boxShadow: "0 16px 36px rgba(26,26,28,0.3)" },
  orb: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  wave: { flex: 1, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  waveBar: { width: 4, height: 40, borderRadius: 2, backgroundColor: "#d6be8c" },
  clock: { fontFamily: fonts.semibold, fontSize: 15, color: "#f2f0ea", minWidth: 40, textAlign: "center" },
  card: { position: "absolute", left: space.lg, right: space.lg, padding: space.xl, gap: space.lg, borderRadius: 28, borderCurve: "continuous", backgroundColor: colors.surface, boxShadow: "0 24px 60px rgba(26,26,28,0.22)" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  mark: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
  buttons: { flexDirection: "row", gap: space.sm },
  save: { flex: 1, height: 50, borderRadius: 25, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  saveText: { fontFamily: fonts.semibold, fontSize: textSize.body, color: colors.surface },
  edit: { paddingHorizontal: space.xl, height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  close: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" }
});
