import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useVoiceCall, voiceCallAvailable } from "@/hooks/use-voice-call";
import { actionRows, applyActions, kindName, opName, type ProposedAction } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import { digits, isArabic, t } from "@/lib/i18n";
import { CALL_VOICES, callClock, callConsentKey, callVoiceKey, isCallVoice, MAX_CALL_SECONDS, type CallPhase, type CallStatus, type CallVoice } from "@/lib/voice-call";

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
  const [voice, setVoice] = useState<CallVoice>(CALL_VOICES[0]);
  const [consent, setConsent] = useState<string | null>(null);
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
    AsyncStorage.multiGet([callConsentKey(userId), callVoiceKey])
      .then(([[, agreed], [, saved]]) => {
        setConsent(agreed);
        if (isCallVoice(saved)) setVoice(saved);
      })
      .catch(() => undefined);
  }, [userId]);

  const pickVoice = (next: CallVoice) => {
    setVoice(next);
    void AsyncStorage.setItem(callVoiceKey, next).catch(() => undefined);
  };

  const begin = () => {
    setPending([]);
    if (consent === "openai") return void call.start(voice);
    // The voice leaves the phone, so ask once. Saying no keeps the call off.
    Alert.alert(t.callConsentTitle, t.callConsentBody, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.callConsentAgree,
        onPress: () => {
          setConsent("openai");
          void AsyncStorage.setItem(callConsentKey(userId), "openai").catch(() => undefined);
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
  const blocked = !voiceCallAvailable ? t.callNeedsBuild : status && !status.available ? t.callNoKey : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.callTitle}</Text>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t.cancel} hitSlop={10}>
          <Icon name="x" size={22} color={colors.onShellMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.stage}>
          <Orb phase={phase} />
          <Text style={styles.phase}>{onCall || phase === "ended" ? phaseText[phase] : t.callTitle}</Text>
          {onCall ? <Text style={type.shellMeta}>{digits(`${callClock(call.seconds)} / ${callClock(MAX_CALL_SECONDS)}`)}</Text> : null}
        </View>

        {onCall || phase === "ended" ? (
          <View style={styles.captions}>
            {shown.length ? (
              shown.map((caption) => (
                <View key={caption.id} style={[styles.caption, caption.role === "user" ? styles.mine : styles.theirs]}>
                  <Text style={type.shellMeta}>{caption.role === "user" ? t.callYou : t.callOrbit}</Text>
                  <Text style={styles.captionText}>{caption.text}</Text>
                </View>
              ))
            ) : phase !== "ended" ? (
              <Text style={[type.shellMuted, { textAlign: "center" }]}>{t.callSayHello}</Text>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={[type.body, styles.intro]}>{t.callIntro}</Text>
            <Text style={type.shellMeta}>{t.callVoice}</Text>
            <View style={styles.chips}>
              {CALL_VOICES.map((name) => (
                <Pressable key={name} onPress={() => pickVoice(name)} accessibilityRole="tab" accessibilityState={{ selected: voice === name }} style={[styles.chip, voice === name && styles.chipOn]}>
                  <Text style={[type.barLabel, voice === name && { color: colors.urgentInk }]}>{name[0].toUpperCase() + name.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.shellMuted}>{t.callCost.replace("{n}", digits(MAX_CALL_SECONDS / 60))}</Text>
          </View>
        )}

        {pending.length ? (
          <View style={styles.card}>
            <Text style={type.tileLabel}>{t.callChanges}</Text>
            {pending.map((item) => (
              <View key={item.key} style={styles.action}>
                <View style={styles.actionHead}>
                  <View style={styles.mark}>
                    <Icon name={item.state === "saved" ? "check" : item.action.op === "delete" ? "trash-2" : item.action.op === "complete" ? "check-circle" : item.action.op === "update" ? "edit-2" : "plus"} size={14} color={colors.urgentInk} />
                  </View>
                  <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>
                    {opName(item.action.op, isArabic)} · {kindName(item.action.kind, isArabic)}
                  </Text>
                  {item.state === "saved" ? (
                    <Text style={[type.pill, { color: colors.inkMuted }]}>{t.callSaved}</Text>
                  ) : (
                    <View style={styles.actionButtons}>
                      <Pressable onPress={() => skip(item)} disabled={item.state === "saving"} accessibilityRole="button" hitSlop={8}>
                        <Text style={[type.pill, { color: colors.inkMuted }]}>{t.assistantSkip}</Text>
                      </Pressable>
                      <Pressable onPress={() => void save(item)} disabled={item.state === "saving"} accessibilityRole="button" style={styles.save}>
                        <Text style={[type.pill, { color: colors.accentInk }]}>{item.state === "saving" ? "…" : t.callSave}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                <Text style={[type.barValue, styles.auto]} numberOfLines={2}>
                  {item.action.label}
                </Text>
                {item.state === "saved"
                  ? null
                  : actionRows(item.action, isArabic).slice(0, 4).map(([key, value]) => (
                      <View key={key} style={styles.field}>
                        <Text style={[type.rowSubtitle, { fontSize: 13 }]}>{key}</Text>
                        <Text style={[type.barValue, { flexShrink: 1, fontSize: 13, textAlign: "right" }]}>{value}</Text>
                      </View>
                    ))}
              </View>
            ))}
          </View>
        ) : null}

        {message ? <Text style={styles.error}>{message}</Text> : null}
        {!onCall && blocked ? (
          <Pressable onPress={() => (voiceCallAvailable ? router.push("/integrations") : undefined)} accessibilityRole={voiceCallAvailable ? "link" : "text"} style={styles.note}>
            <Icon name="info" size={14} color={colors.onShellMuted} />
            <Text style={[type.shellMuted, { flex: 1 }]}>{blocked}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {onCall ? (
        <View style={styles.controls}>
          <Control icon={call.muted ? "mic-off" : "mic"} label={call.muted ? t.callUnmute : t.callMute} on={call.muted} onPress={call.toggleMute} />
          <Pressable onPress={call.hangUp} accessibilityRole="button" accessibilityLabel={t.callEnd} style={styles.end}>
            <Icon name="phone-off" size={26} color="#0a0a0b" />
          </Pressable>
          <Control icon={call.speaker ? "volume-2" : "volume-1"} label={t.callSpeaker} on={call.speaker} onPress={call.toggleSpeaker} />
        </View>
      ) : (
        <View style={styles.footer}>
          <Button title={phase === "ended" ? t.callAgain : t.callStart} variant="primary" disabled={Boolean(blocked) || status === null} onPress={begin} />
        </View>
      )}
    </SafeAreaView>
  );
}

function Control({ icon, label, on, onPress }: { icon: "mic" | "mic-off" | "volume-2" | "volume-1"; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={styles.control}>
      <View style={[styles.controlDot, on && { backgroundColor: colors.onShell }]}>
        <Icon name={icon} size={22} color={on ? colors.urgentInk : colors.onShell} />
      </View>
      <Text style={type.shellMeta}>{label}</Text>
    </Pressable>
  );
}

// Breathes slowly while listening, pulses faster while the assistant talks, holds still otherwise.
function Orb({ phase }: { phase: CallPhase }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const live = phase === "listening" || phase === "speaking" || phase === "thinking";
    if (!live) {
      scale.setValue(1);
      return;
    }
    const [size, ms] = phase === "speaking" ? [1.12, 420] : phase === "thinking" ? [1.05, 700] : [1.06, 1400];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: size, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, scale]);
  const lit = phase === "speaking";
  return (
    <View style={styles.orbWrap}>
      <Animated.View style={[styles.orbHalo, { transform: [{ scale }] }, lit && { borderColor: colors.accent }]} />
      <View style={[styles.orb, lit && { backgroundColor: colors.accent }]}>
        <Icon name={phase === "ended" ? "phone-off" : phase === "connecting" ? "loader" : "phone"} size={34} color={lit ? colors.accentInk : colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.shell },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.onShell },
  body: { padding: 20, gap: 16, flexGrow: 1 },
  stage: { alignItems: "center", gap: 10, paddingVertical: 12 },
  phase: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onShell, textAlign: "center" },
  orbWrap: { width: 168, height: 168, alignItems: "center", justifyContent: "center" },
  orbHalo: { position: "absolute", width: 168, height: 168, borderRadius: 84, borderWidth: 1.5, borderColor: colors.accentLine, backgroundColor: colors.accentTint },
  orb: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.heroEdge },
  intro: { color: colors.onShell, writingDirection: "auto" },
  captions: { gap: 8 },
  caption: { maxWidth: "88%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.tile, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.surfaceInset },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  captionText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.onShell, writingDirection: "auto" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 34, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceInset },
  chipOn: { backgroundColor: colors.urgent },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  action: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  actionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionButtons: { flexDirection: "row", alignItems: "center", gap: 14 },
  mark: { width: 28, height: 28, borderRadius: radius.control, backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  save: { minHeight: 30, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  field: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  auto: { writingDirection: "auto" },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.dangerOnShell },
  note: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.hairline },
  control: { alignItems: "center", gap: 6, minWidth: 72 },
  controlDot: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInset },
  end: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerOnShell },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }
});
