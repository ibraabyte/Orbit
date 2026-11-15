import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, Share, Switch, Text, View } from "react-native";
import { Chip } from "@/components/chips";
import { Card, EmptyState, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { colors, space } from "@/components/theme";
import { ApiError } from "@/lib/api";
import { getApi } from "@/lib/backend";
import {
  bankSmsApi,
  shortcutUrl,
  type BankSmsSettings,
  type BankSmsStatus,
  type BankTemplate,
  type TemplateFields,
  type TemplateKind
} from "@/lib/bank-sms";
import { digits, formatDate, t } from "@/lib/i18n";

const KINDS: TemplateKind[] = ["purchase", "fee", "refund", "transfer_in", "transfer_out", "card_payment", "cash_withdrawal"];
const API = process.env.EXPO_PUBLIC_API_URL ?? "";
const when = (date: string) => formatDate(date, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

type Draft = { example: string; fields: TemplateFields; kind: TemplateKind; words: string[]; label: string };

// Bank SMS in one place: the Shortcut's key, the ready Shortcut, the one automation to make, the message examples that
// let a matching purchase count by itself, and whether the user's AI reads the rest.
export default function BankSms() {
  const { sheet, toast } = useOverlays();
  const [status, setStatus] = useState<BankSmsStatus | null>(null);
  const [settings, setSettings] = useState<BankSmsSettings | null>(null);
  const [templates, setTemplates] = useState<BankTemplate[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await bankSmsApi.status(getApi());
      setStatus(next);
      setTemplates(await bankSmsApi.templates(getApi()));
      setSettings(next.connected ? await bankSmsApi.settings(getApi()) : null);
    } catch {
      // Shown as the empty state; pull to try again.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // One write at a time; a failure says why, and the screen is reloaded either way.
  const run = async (write: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await write();
      if (done) toast(done);
    } catch (error) {
      const code = error instanceof ApiError ? error.message : "";
      Alert.alert(t.error, t.exampleErrors[code] ?? (code.endsWith("_not_in_example") ? t.exampleErrors.other : code || t.error));
    }
    setBusy(false);
    await load();
  };

  const createKey = () => run(async () => setNewKey((await bankSmsApi.newToken(getApi())).token));
  const keyOptions = () =>
    sheet({
      title: t.bankSms,
      detail: status?.last_used_at ? `${t.bankSmsLastUsed} ${when(status.last_used_at)}` : t.bankSmsUnused,
      options: [
        {
          label: t.bankSmsNewKey,
          run: () =>
            Alert.alert(t.bankSmsReplaceTitle, t.bankSmsReplaceBody, [
              { text: t.bankSmsNewKey, style: "destructive", onPress: () => void createKey() },
              { text: t.cancel, style: "cancel" }
            ])
        },
        {
          label: t.bankSmsOff,
          destructive: true,
          run: () =>
            Alert.alert(t.bankSmsOffTitle, t.bankSmsOffBody, [
              { text: t.bankSmsOff, style: "destructive", onPress: () => void run(async () => (setNewKey(null), await bankSmsApi.revokeToken(getApi()))) },
              { text: t.cancel, style: "cancel" }
            ])
        }
      ]
    });

  const read = () =>
    run(async () => {
      if (!paste?.trim()) return;
      const preview = await bankSmsApi.preview(getApi(), paste);
      setDraft({ example: paste, fields: preview.fields, kind: preview.kind, words: preview.words, label: "" });
    });
  const save = (current: Draft) =>
    run(async () => {
      await bankSmsApi.createTemplate(getApi(), { example: current.example, label: current.label.trim() || t.bankKinds[current.kind], kind: current.kind, bank: null, fields: current.fields });
      setDraft(null);
      setPaste(null);
    }, t.exampleSaved);
  const remove = (row: BankTemplate) =>
    Alert.alert(t.exampleDeleteTitle, row.label, [
      { text: t.delete, style: "destructive", onPress: () => void run(() => bankSmsApi.deleteTemplate(getApi(), row.id)) },
      { text: t.cancel, style: "cancel" }
    ]);

  const connected = status?.connected ?? false;
  const setField = (key: keyof Omit<TemplateFields, "wildcards">, value: string) =>
    draft && setDraft({ ...draft, fields: { ...draft.fields, [key]: value || null } });
  const toggleWord = (word: string) => {
    if (!draft) return;
    const on = draft.fields.wildcards.includes(word);
    setDraft({ ...draft, fields: { ...draft.fields, wildcards: on ? draft.fields.wildcards.filter((w) => w !== word) : [...draft.fields.wildcards, word] } });
  };

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Card title={t.bankSms}>
        {/* Nothing until the status is in, so a set-up key never flashes "Not set up". */}
        {status ? (
          <ListRow
            first
            title={connected ? t.bankSmsOn : t.bankSmsNotSet}
            subtitle={status.last_used_at ? `${t.bankSmsLastUsed} ${when(status.last_used_at)}` : connected ? t.bankSmsUnused : null}
            trailing={<RowButton label={connected ? t.bankSmsNewKey : t.bankSmsCreate} onPress={connected ? keyOptions : () => void createKey()} />}
          />
        ) : null}
        {newKey ? (
          <>
            <Text style={type.rowSubtitle}>{t.bankSmsOnce}</Text>
            <Text style={type.rowSubtitle} selectable>
              {newKey}
            </Text>
            <Button title={t.bankSmsShare} onPress={() => void Share.share({ message: newKey })} />
            <Button variant="outline" title={t.done} onPress={() => setNewKey(null)} />
          </>
        ) : null}
      </Card>

      <Card title={t.bankSmsInstall}>
        <Text style={type.rowSubtitle}>{t.bankSmsInstallHint}</Text>
        <Button title={t.bankSmsInstall} disabled={!API} onPress={() => void Linking.openURL(shortcutUrl(API))} />
      </Card>

      <Card title={t.bankSmsAutomation}>
        {t.bankSmsSteps.map((step, index) => (
          <Text key={step} style={type.rowSubtitle}>
            {`${digits(index + 1)}. ${step}`}
          </Text>
        ))}
      </Card>

      <Card title={t.examplesTitle}>
        <Text style={type.rowSubtitle}>{t.examplesHint}</Text>
        {templates.map((row) => (
          <ListRow
            key={row.id}
            title={row.label}
            subtitle={`${t.bankKinds[row.kind]} · ${row.last_matched_at ? `${t.exampleLastMatched} ${when(row.last_matched_at)}` : t.exampleNeverUsed}`}
            onPress={() => remove(row)}
          />
        ))}
        {!templates.length && paste === null ? <EmptyState>{t.examplesEmpty}</EmptyState> : null}

        {paste === null ? (
          <Button variant="outline" title={t.addExample} onPress={() => setPaste("")} />
        ) : !draft ? (
          <>
            <Input multiline autoCorrect={false} autoCapitalize="none" spellCheck={false} value={paste} onChangeText={setPaste} placeholder={t.examplePaste} accessibilityLabel={t.examplePaste} style={{ minHeight: 120, textAlignVertical: "top" }} />
            <Button title={t.exampleRead} disabled={busy || !paste.trim()} onPress={() => void read()} />
            <Button variant="outline" title={t.cancel} onPress={() => setPaste(null)} />
          </>
        ) : (
          <>
            <Text style={type.tileLabel}>{t.exampleWords}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {draft.words.map((word, index) => (
                <Chip key={`${word}-${index}`} label={word} selected={draft.fields.wildcards.includes(word)} onPress={() => toggleWord(word)} />
              ))}
            </View>
            <Field label={t.exampleAmount} value={draft.fields.amount} onChange={(value) => setField("amount", value)} keyboardType="decimal-pad" />
            <Field label={t.exampleCurrency} value={draft.fields.currency} onChange={(value) => setField("currency", value)} />
            <Field label={t.exampleMerchant} value={draft.fields.merchant ?? ""} onChange={(value) => setField("merchant", value)} />
            <Field label={t.exampleCard} value={draft.fields.card_last4 ?? ""} onChange={(value) => setField("card_last4", value)} keyboardType="number-pad" />
            <Field label={t.exampleReference} value={draft.fields.reference ?? ""} onChange={(value) => setField("reference", value)} />
            <Text style={type.tileLabel}>{t.exampleKind}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {KINDS.map((kind) => (
                <Chip key={kind} label={t.bankKinds[kind]} selected={draft.kind === kind} onPress={() => setDraft({ ...draft, kind })} />
              ))}
            </View>
            <Field label={t.exampleLabel} value={draft.label} onChange={(label) => setDraft({ ...draft, label })} placeholder={t.exampleLabelPlaceholder} />
            <Button title={t.exampleSave} disabled={busy || !draft.fields.amount || !draft.fields.currency} onPress={() => void save(draft)} />
            <Button variant="outline" title={t.cancel} onPress={() => (setDraft(null), setPaste(null))} />
          </>
        )}
      </Card>

      {settings?.ai_available ? (
        <Card>
          <ListRow
            first
            title={t.bankSmsAi}
            subtitle={t.bankSmsAiHint}
            trailing={
              <Switch
                accessibilityLabel={t.bankSmsAi}
                trackColor={{ true: colors.accent, false: colors.hairline }}
                value={settings.ai_read}
                disabled={busy}
                onValueChange={(on) => void run(async () => setSettings(await bankSmsApi.setAi(getApi(), on)))}
              />
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; keyboardType?: "decimal-pad" | "number-pad" }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.tileLabel}>{label}</Text>
      <Input value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboardType} accessibilityLabel={label} autoCorrect={false} autoCapitalize="none" />
    </View>
  );
}
