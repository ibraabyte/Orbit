import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Alert, DevSettings, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { resyncWidget } from "@/hooks/use-widget-sync";
import { Avatar, BentoGrid, BentoTile, Card, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { clearAskConsent, loadAskConsent } from "@/hooks/use-ask-consent";
import { st } from "@/lib/app-sections";
import { getApi, signOut } from "@/lib/backend";
import { currentNumerals, saveNumerals, t, toggleLanguage } from "@/lib/i18n";
import { adminApi, type ServerSettings } from "@/lib/integrations";
import type { Numerals } from "@/lib/numerals";

export default function Settings() {
  const { data, userId } = useDashboardData();
  const { sheet, toast } = useOverlays();
  const [lock, setLock] = useState(true);
  const [numerals, setNumerals] = useState<Numerals>(currentNumerals);
  // The AI the person agreed to send their data to for Ask Orbit; null when not agreed.
  const [askConsent, setAskConsent] = useState<string | null>(null);
  // Only the server's admin (the first account) sees the Server card.
  const [server, setServer] = useState<ServerSettings | null>(null);
  const name = data.profile?.display_name ?? "Orbit";
  const { saved: sectionsOff } = useSections();

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void loadAskConsent(userId).then(setAskConsent);
    void (async () => {
      const api = getApi();
      const me = await adminApi.me(api);
      if (me.is_admin) setServer(await adminApi.settings(api));
    })().catch(() => undefined);
  }, []);

  const setSignups = async (open: boolean) => {
    if (!server) return;
    setServer({ ...server, signups_open: open });
    try {
      setServer(await adminApi.setSignupsOpen(getApi(), open));
    } catch (error) {
      setServer(server);
      Alert.alert(t.changeFailed, error instanceof Error ? error.message : t.tryAgain);
    }
  };

  const withdrawAsk = async () => {
    try {
      await clearAskConsent(userId);
      setAskConsent(null);
      toast(t.askWithdrawn);
    } catch {
      Alert.alert(t.changeFailed, t.tryAgain);
    }
  };

  // Every screen already drawn holds its digits, so the app reloads to redraw them all. No reload (web): ask for a restart.
  const changeNumerals = (next: Numerals) => {
    if (next === numerals) return;
    saveNumerals(next);
    setNumerals(next);
    if (__DEV__ && typeof DevSettings.reload === "function") return DevSettings.reload();
    Updates.reloadAsync().catch(() => toast(t.restartForNumerals));
  };
  const numeralsLabel = { arab: t.numeralsArab, latn: t.numeralsLatn };
  const pickNumerals = () =>
    sheet({
      title: t.numerals,
      options: (["arab", "latn"] as const).map((choice) => ({
        label: `${choice === numerals ? "● " : "○ "}${numeralsLabel[choice]}`,
        run: () => changeNumerals(choice)
      }))
    });

  const track = { true: colors.accent, false: colors.hairline };

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}>
        <Avatar name={name} size={48} dark />
        <Text style={[type.title, { flex: 1, fontSize: 16 }]}>{name}</Text>
      </Card>
      {/* Bento, like More: one card per setting, two to a row; a card with a control holds it at its top end. */}
      <BentoGrid>
        <BentoTile icon="layers" title={st.sections} detail={st.sectionsCount(sectionsOff.length)} href="/sections" />
        <BentoTile icon="bell" title={t.notifications} detail={t.notificationsDetail} href="/notifications" />
        <BentoTile
          icon="lock"
          title={t.faceId}
          trailing={
            <Switch
              accessibilityLabel={t.faceId}
              trackColor={track}
              value={lock}
              onValueChange={(next) => {
                setLock(next);
                void setAppLockEnabled(next).then(resyncWidget);
              }}
            />
          }
        />
        <BentoTile
          icon="globe"
          title={t.language}
          detail={t.langLabel}
          onPress={() => {
            const message = toggleLanguage();
            if (message) toast(message);
          }}
        />
        <BentoTile icon="hash" title={t.numerals} detail={numeralsLabel[numerals]} label={`${t.numerals}, ${numeralsLabel[numerals]}`} onPress={pickNumerals} />
        <BentoTile icon="link" title={t.integrations} detail={t.integrationsDetail} href="/integrations" />
        {askConsent ? (
          <View style={{ flexBasis: "100%" }}>
            <Card>
              <Text style={type.rowTitle}>{t.askShare}</Text>
              <Text style={type.rowSubtitle}>{t.askShareDetail.replace("{provider}", askConsent)}</Text>
              <Button variant="outline" title={t.askWithdraw} onPress={() => void withdrawAsk()} />
            </Card>
          </View>
        ) : null}
      </BentoGrid>
      {server ? (
        <BentoGrid>
          <BentoTile
            wide
            icon="user-plus"
            title={t.allowSignups}
            detail={`${server.signups_forced_by_server ? t.signupsForced : server.signups_open ? t.signupsOpen : t.signupsClosed} · ${t.serverOnlyYou}`}
            trailing={
              <Switch
                accessibilityLabel={t.allowSignups}
                trackColor={track}
                value={server.signups_open || server.signups_forced_by_server}
                disabled={server.signups_forced_by_server}
                onValueChange={(next) => void setSignups(next)}
              />
            }
          />
        </BentoGrid>
      ) : null}
      <Button title={t.signOut} onPress={() => void signOut()} />
    </Screen>
  );
}
