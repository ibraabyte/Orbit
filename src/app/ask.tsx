import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { AiPicker } from "@/components/ai-picker";
import { Card, CardLink, type } from "@/components/drift";
import { Button, ErrorState, Input, Loading, Screen } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useAiChoices } from "@/hooks/use-ai-choices";
import { loadAskConsent, saveAskConsent } from "@/hooks/use-ask-consent";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import type { SectionKey } from "@/lib/app-sections";
import { activeProvider, askBody, askGate, ASK_QUESTION_MAX, cleanQuestion, exchanges, historyFor, serverDetail, type ChatItem } from "@/lib/ask";
import { getApi } from "@/lib/backend";
import { isArabic, t } from "@/lib/i18n";
import { aiQuery } from "@/lib/integrations";
import { isNoAiError } from "@/lib/morning-brief";

// Each starter question and the section it asks about (null: always on); a switched-off one is not offered.
const suggestions: [string, SectionKey | null][] = [[t.askQ1, "finance"], [t.askQ2, "finance"], [t.askQ3, null], [t.askQ4, "health"]];

// Ask questions about your own data. The server builds the data and asks your connected AI; the chat lives in memory only.
// Nothing is sent until you agree, once, to sending your data to the AI that is connected now.
export default function Ask() {
  const { userId } = useDashboardData();
  const ai = useAiChoices("ask");
  const { on } = useSections();
  // undefined: not read yet. null: no AI connected / not agreed.
  const provider = ai.overview ? activeProvider(ai.overview, ai.current) : ai.error ? null : undefined;
  const [accepted, setAccepted] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const counter = useRef(0);
  const itemsRef = useRef<ChatItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [overview, consent] = await Promise.all([ai.reload(), loadAskConsent(userId)]);
      setAccepted(consent);
      setLoadError(overview ? null : t.tryAgain);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.tryAgain);
    }
  }, [userId, ai.reload]);

  // Coming back from Integrations or Settings should show the new state.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const update = (next: ChatItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  // Asks, or asks again after a failure. A new question goes at the end; a retried one is answered right under itself.
  const ask = async (question: string, retryId?: number) => {
    if (sending) return;
    const id = retryId ?? ++counter.current;
    if (retryId === undefined) update([...itemsRef.current, { id, role: "user", content: question }]);
    else update(itemsRef.current.map((item) => (item.id === id ? { ...item, failed: undefined } : item)));
    setSending(true);
    try {
      const { text } = await getApi().post<{ text: string }>(`/assistant/ask${aiQuery(ai.current)}`, askBody(question, historyFor(itemsRef.current, id), isArabic ? "ar" : "en"));
      const at = itemsRef.current.findIndex((item) => item.id === id);
      const next = [...itemsRef.current];
      next.splice(at + 1, 0, { id: ++counter.current, role: "assistant", content: text });
      update(next);
    } catch (error) {
      const message = `${t.askFailed} ${serverDetail(error, isArabic)}`.trim();
      update(itemsRef.current.map((item) => (item.id === id ? { ...item, failed: message } : item)));
      // The AI was disconnected since this screen loaded: show the connect prompt rather than a dead end.
      if (isNoAiError(error)) void load();
    } finally {
      setSending(false);
    }
  };

  const send = (text: string) => {
    const question = cleanQuestion(text);
    if (!question || sending) return;
    setDraft("");
    void ask(question);
  };

  const agree = async () => {
    if (!provider) return;
    try {
      await saveAskConsent(userId, provider);
      setAccepted(await loadAskConsent(userId));
    } catch {
      Alert.alert(t.askAgreeFailed, t.tryAgain);
    }
  };

  const gate = askGate(provider, accepted);
  const chat = useMemo(() => exchanges(items), [items]);

  if (loadError && gate === "loading") {
    return (
      <Screen>
        <ErrorState detail={loadError} onRetry={load} />
      </Screen>
    );
  }
  if (gate === "loading") {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <AiPicker choices={ai.choices} value={ai.current} onChange={ai.setPicked} onShell />
      {gate === "no-ai" ? (
        <Card title={t.askOrbit} action={<CardLink href="/integrations" label={t.askConnect} />}>
          <Text style={type.body}>{t.askNoAi}</Text>
        </Card>
      ) : null}
      {gate === "consent" ? (
        <Card title={t.askConsentTitle}>
          <Text style={type.body}>{t.askConsentBody.replace("{provider}", provider ?? "")}</Text>
          <Button variant="primary" title={t.askAgree} onPress={() => void agree()} />
        </Card>
      ) : null}
      {gate === "ready" ? (
        <>
          <Card style={{ gap: 10 }}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder={t.askPlaceholder}
              accessibilityLabel={t.askPlaceholder}
              maxLength={ASK_QUESTION_MAX}
              multiline
              returnKeyType="send"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={() => send(draft)}
              style={{ minHeight: 48, paddingTop: 12, paddingBottom: 12, textAlign: "auto", writingDirection: "auto" }}
            />
            <Button variant="primary" title={sending ? t.askThinking : t.askSend} disabled={sending || !cleanQuestion(draft)} onPress={() => send(draft)} />
          </Card>
          {chat.length === 0 ? (
            <Card title={t.askSuggested}>
              <Text style={type.rowSubtitle}>{t.askIntro}</Text>
              <View style={styles.chips}>
                {suggestions.filter(([, section]) => !section || on(section)).map(([question]) => (
                  <Pressable key={question} accessibilityRole="button" disabled={sending} onPress={() => send(question)} style={styles.chip}>
                    <Text style={type.pill}>{question}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
          {chat.map(({ question, answer }) => (
            <Card key={question.id} style={{ gap: 10 }}>
              <View style={{ gap: 2 }}>
                <Text style={type.tileLabel}>{t.askYou}</Text>
                <Text style={[type.body, styles.text]}>{question.content}</Text>
              </View>
              {answer ? (
                <View style={{ gap: 2 }}>
                  <Text style={type.tileLabel}>{t.askAnswer}</Text>
                  <Text style={[type.body, styles.text]} selectable>
                    {answer.content}
                  </Text>
                </View>
              ) : null}
              {!answer && !question.failed ? (
                <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
                  {t.askThinking}
                </Text>
              ) : null}
              {question.failed ? (
                <View style={{ gap: 8 }}>
                  <Text style={[type.rowSubtitle, { color: colors.dangerOnShell }]} accessibilityRole="alert">{question.failed}</Text>
                  <Button variant="outline" title={t.askRetry} disabled={sending} onPress={() => void ask(question.content, question.id)} />
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { writingDirection: "auto" },
  chips: { gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.tile, backgroundColor: colors.surfaceInset }
});
