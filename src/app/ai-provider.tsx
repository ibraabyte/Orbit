import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ModelPicker, ProviderMark } from "@/components/ai-provider-parts";
import { ChatgptConnectForm } from "@/components/chatgpt-connect-form";
import { Badge, Card, EmptyState, Icon, ListRow, type } from "@/components/drift";
import { Button, Input, Loading, Screen, Segments } from "@/components/screen";
import { loadAskConsent, saveAskConsent } from "@/hooks/use-ask-consent";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { colors, fonts } from "@/components/theme";
import { consentNames } from "@/lib/ask";
import { firstModel, isProviderId, openrouterResult, PROVIDERS, providersApi, providerState, type ProviderModel } from "@/lib/ai-providers";
import { getApi } from "@/lib/backend";
import { removeBody } from "@/lib/feature-models";
import { digits, isArabic, t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, integrationsApi, VOICE_PROVIDER_NAMES, type AiProvider, type IntegrationsOverview, type VoiceProvider } from "@/lib/integrations";

type Busy = "test" | "save" | "model" | "remove" | "speech" | "account" | "default" | "instructions";
type Notice = { ok: boolean; message: string };

// One AI company: add, test, change or remove its key, pick its model from the company's own list, and turn on what
// else it can do (speech to text, the voice call). OpenAI and OpenRouter can also be connected with an account.
// Connecting an AI for text is also the person's agreement to send their items to it (Apple 5.1.2(i)): the note sits
// next to the connect button, and the agreement is saved on this phone the moment the connection works. An AI connected
// before that (or the agreement withdrawn in Settings) gets an Allow card here, so Today never has to ask.
export default function AiProvider() {
  const { userId } = useDashboardData();
  const [accepted, setAccepted] = useState<string | null>(null);
  const params = useLocalSearchParams<{ id?: string; status?: string }>();
  const id = isProviderId(params.id) ? params.id : "openai";
  const provider = PROVIDERS[id];
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<ProviderModel[] | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  const [pickedSpeech, setPickedSpeech] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [method, setMethod] = useState<"key" | "account" | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [notice, setNotice] = useState<Notice | null>(params.status ? openrouterResult(`?status=${params.status}`) : null);

  const state = overview ? providerState(overview, id) : null;

  const load = useCallback(async () => {
    try {
      const next = await integrationsApi.overview(getApi());
      setOverview(next);
      setLoadError(null);
      return next;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, []);

  // The saved key's models, straight from the company, each time the page opens.
  const fetchSaved = useCallback(async () => {
    try {
      setModels((await providersApi.models(getApi(), id)).models);
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : t.tryAgain });
    }
  }, [id]);

  useEffect(() => {
    void loadAskConsent(userId).then(setAccepted);
  }, [userId]);

  // Saves the agreement for these AIs (as the brief and assistant name them: "Claude", "ChatGPT"…).
  const agree = async (...names: string[]) => {
    for (const name of names) await saveAskConsent(userId, name);
    setAccepted(await loadAskConsent(userId));
  };

  useEffect(() => {
    void load().then((next) => {
      if (next && providerState(next, id).keySaved) void fetchSaved();
    });
  }, [load, fetchSaved, id]);

  if (!overview || !state) {
    return (
      <Screen title={provider.name} onRefresh={load}>
        {loadError ? <EmptyState>{loadError}</EmptyState> : <Loading />}
      </Screen>
    );
  }

  const run = async (kind: Busy, action: () => Promise<Notice | void>) => {
    setBusy(kind);
    try {
      const result = await action();
      if (result) setNotice(result);
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : t.tryAgain });
    } finally {
      setBusy(null);
    }
  };

  const hasText = provider.roles.includes("text");
  const hasSpeech = provider.roles.includes("speech");
  const voice = overview.voice;
  const otherVoice = voice?.connected && voice.provider && voice.provider !== id ? VOICE_PROVIDER_NAMES[voice.provider] : null;
  const showKeyForm = !state.keySaved || editingKey;
  const tab = method ?? (provider.account === "chatgpt" && !state.keySaved && overview.chatgpt.status !== "not_connected" ? "account" : "key");
  const instructionsNow = instructions ?? state.instructions ?? "";
  const textModel = pickedModel ?? state.textModel;
  // The AIs of this company in use for text right now that have no agreement yet.
  const unshared = [state.textModel ? AI_CHOICE_NAMES[id as AiProvider] : null, state.account ? AI_CHOICE_NAMES.chatgpt : null].filter(
    (name): name is string => name !== null && !consentNames(accepted).includes(name)
  );
  const shareNote = (name: string) => <Text style={type.rowSubtitle}>{t.pv.shareNote.replace("{name}", name)}</Text>;

  const test = () =>
    run("test", async () => {
      const found = (await providersApi.models(getApi(), id, showKeyForm ? keyInput : undefined)).models;
      setModels(found);
      return { ok: true, message: digits(t.pv.testOk.replace("{n}", String(found.length))) };
    });

  const save = () =>
    run("save", async () => {
      const apiKey = keyInput.trim();
      if (hasText) {
        const model = firstModel(models ?? [], "text", textModel) ?? (id === "anthropic" ? "" : null);
        if (model === null) return { ok: false, message: t.pv.testFirst };
        await integrationsApi.connectAi(getApi(), { provider: id as AiProvider, model, apiKey, instructions: instructionsNow });
        await agree(AI_CHOICE_NAMES[id as AiProvider]);
        // The same key also feeds speech to text when this company is the voice model.
        if (state.speechModel && apiKey && id === "openai") await integrationsApi.connectVoice(getApi(), { provider: "openai", model: state.speechModel, apiKey });
      } else {
        await integrationsApi.connectVoice(getApi(), { provider: id as VoiceProvider, model: pickedSpeech ?? firstModel(models ?? [], "speech", state.speechModel) ?? "", apiKey });
      }
      setKeyInput("");
      setEditingKey(false);
      await load();
      await fetchSaved();
      return { ok: true, message: t.saved };
    });

  const pickModel = (model: string) => {
    if (!state.textModel) {
      setPickedModel(model);
      return;
    }
    void run("model", async () => {
      await integrationsApi.connectAi(getApi(), { provider: id as AiProvider, model, apiKey: "", instructions: instructionsNow });
      setPickedModel(null);
      await load();
      return { ok: true, message: t.saved };
    });
  };

  const pickSpeech = (model: string) => {
    if (!state.speechModel) {
      setPickedSpeech(model);
      return;
    }
    void run("speech", async () => {
      await integrationsApi.connectVoice(getApi(), { provider: id as VoiceProvider, model, apiKey: "" });
      await load();
      return { ok: true, message: t.saved };
    });
  };

  const startSpeech = () =>
    run("speech", async () => {
      await integrationsApi.connectVoice(getApi(), { provider: "openai", model: firstModel(models ?? [], "speech", pickedSpeech) ?? "", apiKey: "" });
      await load();
      return { ok: true, message: t.saved };
    });

  const stopSpeech = () =>
    run("speech", async () => {
      await integrationsApi.disconnectVoice(getApi());
      await load();
    });

  const names = state.usedBy.map((feature) => t.featureNames[feature]);
  const remove = () =>
    Alert.alert(t.pv.removeTitle.replace("{name}", provider.name), removeBody(t.pv.removeBody, names), [
      {
        text: t.pv.removeAll,
        style: "destructive",
        onPress: () =>
          void run("remove", async () => {
            if (state.textModel && hasText) await integrationsApi.disconnectOneAi(getApi(), id as AiProvider);
            if (state.speechModel) await integrationsApi.disconnectVoice(getApi());
            setModels(null);
            setPickedModel(null);
            setEditingKey(false);
            await load();
          })
      },
      { text: t.cancel, style: "cancel" }
    ]);

  const makeDefault = () =>
    run("default", async () => {
      await integrationsApi.setAiDefault(getApi(), state.textModel ? (id as AiProvider) : "chatgpt");
      await load();
    });

  const saveInstructions = () =>
    run("instructions", async () => {
      await integrationsApi.connectAi(getApi(), { provider: id as AiProvider, model: state.textModel ?? "", apiKey: "", instructions: instructionsNow });
      setInstructions(null);
      await load();
      return { ok: true, message: t.saved };
    });

  const openrouterSignIn = () =>
    run("account", async () => {
      // The server sends the browser back to this link, which also closes the sign-in sheet.
      const returnTo = Linking.createURL("ai-provider", { queryParams: { id: "openrouter" } });
      const { authorization_url } = await providersApi.startOpenrouter(getApi(), returnTo);
      const result = await WebBrowser.openAuthSessionAsync(authorization_url, returnTo);
      await load();
      if (result.type !== "success") return;
      const outcome = openrouterResult(result.url);
      if (outcome?.ok) {
        await agree(AI_CHOICE_NAMES.openrouter);
        await fetchSaved();
      }
      return outcome ?? undefined;
    });

  return (
    <Screen title={provider.name} onRefresh={() => void load()}>
      <View style={styles.header}>
        <ProviderMark provider={provider} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.headerLine}>
            <Text style={styles.name}>{provider.name}</Text>
            {state.connected ? (
              <View style={styles.on} accessibilityLabel={state.isDefault ? t.pv.isDefault : t.pv.connected}>
                <Icon name={state.isDefault ? "star" : "check"} size={13} color={colors.accentInk} />
              </View>
            ) : null}
          </View>
          <Text style={type.rowSubtitle}>{t.pv.blurbs[id]}</Text>
        </View>
      </View>

      {notice ? (
        <View style={[styles.notice, !notice.ok && styles.noticeBad]}>
          <Icon name={notice.ok ? "check-circle" : "alert-circle"} size={16} color={notice.ok ? colors.accentDeep : colors.dangerOnShell} />
          <Text style={[type.rowSubtitle, { flex: 1, color: colors.ink }]}>{notice.message}</Text>
        </View>
      ) : null}

      {unshared.length ? (
        <Card title={t.pv.shareTitle.replace("{name}", unshared.join(isArabic ? " و" : " & "))}>
          <Button title={t.pv.shareAllow} onPress={() => void agree(...unshared).catch(() => Alert.alert(t.changeFailed, t.tryAgain))} />
        </Card>
      ) : null}

      {provider.account ? (
        <Segments
          options={["key", "account"] as const}
          labels={{ key: t.pv.methodKey, account: provider.account === "chatgpt" ? t.pv.methodChatgpt : t.pv.methodOpenrouter }}
          value={tab}
          onChange={setMethod}
        />
      ) : null}

      {tab === "account" && provider.account === "chatgpt" ? (
        <Card title={t.pv.methodChatgpt}>
          {state.account ? null : shareNote(AI_CHOICE_NAMES.chatgpt)}
          <ChatgptConnectForm
            status={overview.chatgpt}
            start={async () => {
              const result = await integrationsApi.startChatgpt(getApi());
              setOverview((current) => (current ? { ...current, chatgpt: { status: result.status } } : current));
              return result.authorization_url;
            }}
            finish={async (callbackUrl) => {
              try {
                await integrationsApi.finishChatgpt(getApi(), callbackUrl);
                await agree(AI_CHOICE_NAMES.chatgpt);
              } finally {
                await load();
              }
            }}
            disconnect={async () => {
              await integrationsApi.disconnectChatgpt(getApi());
              await load();
            }}
          />
        </Card>
      ) : null}

      {tab === "account" && provider.account === "openrouter" ? (
        <Card title={t.pv.methodOpenrouter}>
          {state.keySaved ? <ListRow leading={<Icon name="check-circle" size={18} color={colors.accentDeep} />} title={t.pv.connected} subtitle={state.textModel} /> : shareNote(provider.name)}
          <Button title={busy === "account" ? t.connecting : t.pv.openrouterSignIn} disabled={busy !== null} onPress={() => void openrouterSignIn()} />
        </Card>
      ) : null}

      {tab === "key" ? (
        <Card title={t.pv.keyTitle}>
          {showKeyForm ? (
            <>
              <Input
                accessibilityLabel={t.apiKey}
                placeholder={t.pv.keyPlaceholder}
                value={keyInput}
                onChangeText={setKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                secureTextEntry
                editable={busy === null}
                style={{ writingDirection: "ltr" }}
              />
              {!hasText && otherVoice ? <Text style={type.rowSubtitle}>{t.pv.speechReplaces.replace("{name}", otherVoice)}</Text> : null}
              {hasText ? shareNote(AI_CHOICE_NAMES[id as AiProvider]) : null}
              <View style={styles.buttons}>
                <View style={{ flex: 1 }}>
                  <Button variant="outline" title={busy === "test" ? t.pv.testing : t.pv.test} disabled={busy !== null || keyInput.trim().length < 8} onPress={() => void test()} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={busy === "save" ? t.pv.saving : t.pv.save} disabled={busy !== null || keyInput.trim().length < 8} onPress={() => void save()} />
                </View>
              </View>
              {editingKey ? <Button variant="outline" title={t.cancel} onPress={() => { setEditingKey(false); setKeyInput(""); }} /> : null}
              <Pressable onPress={() => void Linking.openURL(provider.keyUrl)} accessibilityRole="link" hitSlop={6}>
                <Text style={[type.rowSubtitle, { color: colors.link }]}>{t.pv.getKey}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ListRow leading={<Icon name="key" size={18} color={colors.accentDeep} />} title={t.pv.keySaved} subtitle={models ? digits(t.pv.testOk.replace("{n}", String(models.length))) : null} />
              <View style={styles.buttons}>
                <View style={{ flex: 1 }}>
                  <Button variant="outline" title={busy === "test" ? t.pv.testing : t.pv.test} disabled={busy !== null} onPress={() => void test()} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button variant="outline" title={t.pv.change} disabled={busy !== null} onPress={() => setEditingKey(true)} />
                </View>
              </View>
              <Button variant="outline" title={busy === "remove" ? t.pv.saving : t.pv.removeAll} disabled={busy !== null} onPress={remove} />
            </>
          )}
        </Card>
      ) : null}

      {hasText && tab === "key" && (state.keySaved || models) ? (
        <Card title={t.pv.modelTitle}>
          {models ? (
            <ModelPicker provider={provider} models={models} kind="text" value={textModel} onPick={pickModel} disabled={busy !== null} />
          ) : (
            <Text style={type.rowSubtitle}>{state.textModel ?? t.pv.testFirst}</Text>
          )}
          {state.textModel ? (
            <>
              <Input accessibilityLabel={t.aiInstructions} placeholder={t.aiInstructions} value={instructionsNow} onChangeText={setInstructions} maxLength={1000} multiline style={{ height: 96 }} />
              {instructions !== null && instructions !== (state.instructions ?? "") ? (
                <Button variant="outline" title={busy === "instructions" ? t.pv.saving : t.pv.instructionsSave} disabled={busy !== null} onPress={() => void saveInstructions()} />
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {hasSpeech && tab === "key" && (state.keySaved || models) ? (
        <Card title={t.pv.speechTitle} action={<Badge tone={state.speechModel ? "success" : "neutral"}>{state.speechModel ? t.voiceOn : t.pv.speechOff}</Badge>}>
          {state.speechModel ? <Text style={type.rowSubtitle}>{t.pv.speechOn.replace("{name}", provider.name)}</Text> : null}
          {models ? <ModelPicker provider={provider} models={models} kind="speech" value={firstModel(models, "speech", pickedSpeech ?? state.speechModel)} onPick={pickSpeech} disabled={busy !== null} /> : null}
          {id === "openai" && state.textModel && !state.speechModel ? (
            <>
              {otherVoice ? <Text style={type.rowSubtitle}>{t.pv.speechReplaces.replace("{name}", otherVoice)}</Text> : null}
              <Button title={busy === "speech" ? t.pv.saving : t.pv.speechUse} disabled={busy !== null} onPress={() => void startSpeech()} />
            </>
          ) : null}
          {id === "openai" && state.speechModel && state.textModel ? <Button variant="outline" title={t.pv.speechStop} disabled={busy !== null} onPress={() => void stopSpeech()} /> : null}
        </Card>
      ) : null}

      {provider.roles.includes("call") && state.connected ? (
        <Card title={t.pv.callTitle}>
          <ListRow leading={<Icon name="phone-call" size={18} color={colors.inkMuted} />} title={t.pv.callInfo} onPress={() => router.push("/ai-features")} chevron />
        </Card>
      ) : null}

      {/* The header's badge already says when this is the default; otherwise one button makes it so. */}
      {(state.textModel || state.account) && hasText && !state.isDefault ? <Button variant="outline" title={t.pv.makeDefault} disabled={busy !== null} onPress={() => void makeDefault()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", gap: 14, alignItems: "center", paddingHorizontal: 4, paddingVertical: 6 },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentLine, backgroundColor: colors.accentTint },
  noticeBad: { borderColor: colors.dangerOnShell, backgroundColor: colors.surface },
  buttons: { flexDirection: "row", gap: 10 },
  on: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }
});
