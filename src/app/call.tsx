import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { OrbitMark } from "@/components/assistant-button";
import { Icon } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { elevenLabsAvailable, useVoiceCall, voiceCallAvailable } from "@/hooks/use-voice-call";
import { actionRows, applyActions, kindName, opName, type ProposedAction } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import { digits, isArabic, t } from "@/lib/i18n";
import { callClock, callConsentKey, callVoiceKey, firstVoices, voiceLabel, MAX_CALL_SECONDS, pickedVoice, providerName, providerOf, voiceOptions, type CallPhase, type CallStatus } from "@/lib/voice-call";

const phaseText: Record<CallPhase, string> = {
  idle: "",
  connecting: t.callConnecting,
  listening: t.callListening,
  thinking: t.callThinking,
  speaking: t.callSpeaking,
  ended: t.callEnded
};

const errorText = (error: string | null) => {
  if (!error) return null;
  if (error === "noKey") return t.callNoKey;
  if (error === "mic") return t.callMicDenied;
  if (error === "lost") return t.callLost;
  if (error === "update") return t.callNeedsUpdate;
  if (error === "elevenKey") return t.callElevenKey;
  // A server message is English; in Arabic only the local text is shown.
  if (error === "start" || isArabic) return t.callFailed;
  return `${t.callFailed} ${error}`;
};

type Pending = { key: number; action: ProposedAction; state: "new" | "saving" | "saved" | "failed" };

// The voice call with the assistant: a round "orb" that breathes while it listens and swells while it talks, the words
// said on both sides as captions, and the changes it prepares as cards to tap. Opened from the assistant sheet.
export default function Call() {
  const { refresh, userId } = useDashboardData();
  const { toast } = useOverlays();
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [saved, setSaved] = useState<Record<string, string | null>>({});
  const [consent, setConsent] = useState<string | null>(null);
  // The screen opens as a full-screen modal, where iOS can report no top inset; the app window's insets are the real ones.
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  const bottom = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  const [pending, setPending] = useState<Pending[]>([]);
  const counter = useRef(0);
  const call = useVoiceCall({
    arabic: isArabic,
    onActions: (actions) => setPending((current) => [...current, ...actions.map((action) => ({ key: (counter.current += 1), action, state: "new" as const }))])
  });
  const { phase, captions, error } = call.view;
  const onCall = phase !== "idle" && phase !== "ended";

  useEffect(() => {
    getApi()
      .get<CallStatus>("/assistant/call")
      .then(setStatus)
      .catch(() => setStatus({ available: false, source: null, voices: [] }));
    AsyncStorage.multiGet([callConsentKey(userId), callVoiceKey("openai"), callVoiceKey("elevenlabs")])
      .then(([[, agreed], [, openai], [, elevenlabs]]) => {
        setConsent(agreed);
        setSaved({ openai, elevenlabs });
      })
      .catch(() => undefined);
  }, [userId]);

  const provider = providerOf(status);
  const company = providerName(provider);
  const voices = voiceOptions(status);
  const voice = pickedVoice(voices, saved[provider]);

  const pickVoice = (next: string) => {
    setSaved((current) => ({ ...current, [provider]: next }));
    void AsyncStorage.setItem(callVoiceKey(provider), next).catch(() => undefined);
  };

  const begin = () => {
    setPending([]);
    // The first call settles the voice; after that it is changed under Connections › Advanced.
    if (voice && !saved[provider]) pickVoice(voice);
    // Agreed for this company (the value is the company; agreeing to one doesn't cover the other).
    if (consent?.split(",").includes(provider)) return void call.start(voice);
    // The voice leaves the phone, so ask once. Saying no keeps the call off.
    Alert.alert(t.callConsentTitle.replaceAll("{company}", company), t.callConsentBody.replaceAll("{company}", company), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.callConsentAgree,
        onPress: () => {
          const next = [...(consent?.split(",").filter(Boolean) ?? []), provider].join(",");
          setConsent(next);
          void AsyncStorage.setItem(callConsentKey(userId), next).catch(() => undefined);
          void call.start(voice);
        }
      }
    ]);
  };

  const save = async (item: Pending) => {
    setPending((current) => current.map((p) => (p.key === item.key ? { ...p, state: "saving" } : p)));
    const result = await applyActions(getApi(), [item.action]);
    const ok = result.failed.length === 0;
    setPending((current) => current.map((p) => (p.key === item.key ? { ...p, state: ok ? "saved" : "failed" } : p)));
    if (ok) {
      call.noteSaved([item.action.label]);
      void refresh();
    } else toast(t.assistantSomeFailed);
  };

  const skip = (item: Pending) => setPending((current) => current.filter((p) => p.key !== item.key));

  const close = () => {
    call.hangUp();
    router.back();
  };

  const shown = captions.filter((caption) => caption.text.trim()).slice(-6);
  const message = errorText(error);
  const blocked = !voiceCallAvailable
    ? t.callNeedsBuild
    : status && !status.available
      ? t.callNoKey
      : provider === "elevenlabs" && !elevenLabsAvailable
        ? t.callNeedsUpdate
        : null;

  const live = onCall || phase === "ended";
  return (
    <View style={[styles.screen, { paddingTop: top, paddingBottom: bottom }]}>
      <View style={styles.header}>
        <Orb phase={phase} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>Orbit</Text>
          <Text style={styles.meta}>{live ? `${phaseText[phase]}${onCall ? ` · ${digits(callClock(call.seconds))}` : ""}` : t.callTitle}</Text>
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t.cancel} hitSlop={10} style={styles.closeButton}>
          <Icon name="x" size={20} color={D.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {live ? (
          <View style={styles.captions}>
            {shown.length ? (
              shown.map((caption) => (
                <View key={caption.id} style={[styles.bubble, caption.role === "user" ? styles.mine : styles.theirs]} accessibilityLabel={`${caption.role === "user" ? t.callYou : t.callOrbit}: ${caption.text}`}>
                  <Text style={[styles.bubbleText, caption.role !== "user" && { color: D.sand }]}>{caption.text}</Text>
                </View>
              ))
            ) : phase !== "ended" ? (
              <Text style={styles.hint}>{t.callSayHello}</Text>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={styles.stage}>
              <Orb phase={phase} size={148} />
            </View>
            {/* A few voices to pick from the first time only; later the voice is changed in settings. */}
            {voices.length && !saved[provider] ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.meta}>{t.callVoice}</Text>
                <View style={styles.chips}>
                  {firstVoices(voices, voice).map((option) => (
                    <Pressable key={option.id} onPress={() => pickVoice(option.id)} accessibilityRole="tab" accessibilityState={{ selected: voice === option.id }} style={[styles.chip, voice === option.id && styles.chipOn]}>
                      <Text style={[styles.chipText, voice === option.id && { color: D.bg }]} numberOfLines={1}>
                        {voiceLabel(option)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {provider === "elevenlabs" && !voices.length ? <Text style={styles.hint}>{t.callVoicesEmpty}</Text> : null}
            <Text style={styles.hint}>{(provider === "elevenlabs" ? t.callCostEleven : t.callCost).replace("{n}", digits(MAX_CALL_SECONDS / 60))}</Text>
          </View>
        )}
        {/* What the assistant wants to change, one card each, saved only on a tap. */}
        {pending.map((item) => (
          <View key={item.key} style={styles.card}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.action.label}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {[`${opName(item.action.op, isArabic)} · ${kindName(item.action.kind, isArabic)}`, ...actionRows(item.action, isArabic).slice(0, 2).map(([, value]) => value)].join(" · ")}
              </Text>
            </View>
            {item.state === "saved" ? (
              <Icon name="check" size={20} color={D.sand} />
            ) : (
              <View style={styles.cardButtons}>
                <Pressable onPress={() => skip(item)} disabled={item.state === "saving"} accessibilityRole="button" accessibilityLabel={t.assistantSkip} hitSlop={8}>
                  <Icon name="x" size={18} color={D.muted} />
                </Pressable>
                <Pressable onPress={() => void save(item)} disabled={item.state === "saving"} accessibilityRole="button" style={styles.save}>
                  <Text style={styles.saveText}>{item.state === "saving" ? "…" : t.callSave}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        {!onCall && blocked ? (
          <Pressable onPress={() => (voiceCallAvailable ? router.push("/integrations") : undefined)} accessibilityRole={voiceCallAvailable ? "link" : "text"} style={styles.note}>
            <Icon name="info" size={14} color={D.muted} />
            <Text style={[styles.hint, { flex: 1, textAlign: "auto" }]}>{blocked}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {onCall ? (
        <View style={styles.controls}>
          <Control icon={call.muted ? "mic-off" : "mic"} label={call.muted ? t.callUnmute : t.callMute} on={call.muted} onPress={call.toggleMute} />
          <Pressable onPress={call.hangUp} accessibilityRole="button" accessibilityLabel={t.callEnd} style={styles.end}>
            <Icon name="x" size={28} color="#ffffff" />
          </Pressable>
          <Control icon={call.speaker ? "volume-2" : "volume-1"} label={t.callSpeaker} on={call.speaker} onPress={call.toggleSpeaker} />
        </View>
      ) : (
        <View style={styles.footer}>
          <Button title={phase === "ended" ? t.callAgain : t.callStart} variant="primary" disabled={Boolean(blocked) || status === null} onPress={begin} />
        </View>
      )}
    </View>
  );
}

// A round button: the label is read aloud, not shown.
function Control({ icon, label, on, onPress }: { icon: "mic" | "mic-off" | "volume-2" | "volume-1"; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={[styles.controlDot, on && { backgroundColor: D.ink }]}>
      <Icon name={icon} size={24} color={on ? D.bg : D.ink} />
    </Pressable>
  );
}

// The Orbit mark on a sand circle with a glow: breathes slowly while listening, pulses faster while it talks.
function Orb({ phase, size }: { phase: CallPhase; size: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const live = phase === "listening" || phase === "speaking" || phase === "thinking";
    if (!live) {
      scale.setValue(1);
      return;
    }
    const [grow, ms] = phase === "speaking" ? [1.14, 420] : phase === "thinking" ? [1.06, 700] : [1.08, 1400];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: grow, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, scale]);
  const halo = size * 1.5;
  return (
    <View style={{ width: halo, height: halo, alignItems: "center", justifyContent: "center", margin: -(halo - size) / 2 }} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View style={{ position: "absolute", width: halo, height: halo, borderRadius: halo / 2, backgroundColor: "rgba(214,190,140,0.14)", transform: [{ scale }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: phase === "ended" ? D.inset : D.sand, alignItems: "center", justifyContent: "center", boxShadow: phase === "ended" ? undefined : "0 0 28px rgba(214,190,140,0.45)" }}>
        <OrbitMark size={size * 0.5} color={phase === "ended" ? D.muted : D.bg} />
      </View>
    </View>
  );
}

// The call is always dark, whatever the app's look, like the phone's own call screen.
const D = { bg: "#0a0a0b", surface: "#131315", inset: "#1e1e21", ink: "#f2f0ea", muted: "#a39a8a", sand: "#d6be8c", tint: "#2a2418", hair: "#2a2a2e", danger: "#e5484d" };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  name: { fontFamily: fonts.semibold, fontSize: 17, color: D.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: D.muted },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: D.inset },
  body: { paddingHorizontal: 18, paddingVertical: 16, gap: 10, flexGrow: 1, justifyContent: "flex-end" },
  stage: { alignItems: "center", paddingVertical: 48 },
  captions: { gap: 10 },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { alignSelf: "flex-start", backgroundColor: D.inset },
  theirs: { alignSelf: "flex-end", backgroundColor: D.tint },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: D.ink, writingDirection: "auto" },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: D.muted, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 36, maxWidth: "100%", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, backgroundColor: D.inset },
  chipOn: { backgroundColor: D.sand },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: D.ink },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: D.hair, backgroundColor: D.surface },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, color: D.ink, writingDirection: "auto" },
  cardMeta: { fontFamily: fonts.regular, fontSize: 12, color: D.muted },
  cardButtons: { flexDirection: "row", alignItems: "center", gap: 14 },
  save: { height: 36, paddingHorizontal: 16, justifyContent: "center", borderRadius: 18, backgroundColor: D.sand },
  saveText: { fontFamily: fonts.semibold, fontSize: 14, color: D.bg },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: D.danger },
  note: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingTop: 12, paddingBottom: 16 },
  controlDot: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: D.inset },
  end: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: D.danger },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }
});
