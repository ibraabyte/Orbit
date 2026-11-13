import { Link } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Alert, DevSettings, Pressable, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { resyncWidget } from "@/hooks/use-widget-sync";
import { Avatar, Card, Chevron, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { clearAskConsent, loadAskConsent } from "@/hooks/use-ask-consent";
import { getApi, signOut } from "@/lib/backend";
import { currentNumerals, saveNumerals, t, toggleLanguage } from "@/lib/i18n";
import { adminApi, type ServerSettings } from "@/lib/integrations";
import type { Numerals } from "@/lib/numerals";

// A row in the settings card. The top row (first) has no line above it.
function Setting({ label, detail, first, children }: { label: string; detail?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.surfaceInset }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.rowTitle}>{label}</Text>
        {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

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
      <Card list>
        <Setting first label={t.faceId}>
          <Switch
            accessibilityLabel={t.faceId}
            trackColor={track} thumbColor={colors.ink}
            value={lock}
            onValueChange={(next) => {
              setLock(next);
              void setAppLockEnabled(next).then(resyncWidget);
            }}
          />
        </Setting>
        <Link href="/notifications" asChild>
          <Pressable accessibilityRole="link">
            <Setting label={t.notifications} detail={t.notificationsDetail}>
              <Chevron />
            </Setting>
          </Pressable>
        </Link>
        {askConsent ? (
          <Setting label={t.askShare} detail={t.askShareDetail.replace("{provider}", askConsent)}>
            <Button variant="outline" title={t.askWithdraw} onPress={() => void withdrawAsk()} />
          </Setting>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const message = toggleLanguage();
            if (message) toast(message);
          }}
        >
          <Setting label={t.language}>
            <Text style={type.rowSubtitle}>{t.langLabel}</Text>
            <Chevron />
          </Setting>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t.numerals}, ${numeralsLabel[numerals]}`} onPress={pickNumerals}>
          <Setting label={t.numerals}>
            <Text style={type.rowSubtitle}>{numeralsLabel[numerals]}</Text>
            <Chevron />
          </Setting>
        </Pressable>
      </Card>
      <Card title={t.integrations}>
        <ListRow leading={<IconTile name="link" />} title={t.integrations} subtitle={t.integrationsDetail} href="/integrations" chevron />
      </Card>
      {server ? (
        <Card title={t.serverCard}>
          <Text style={type.rowSubtitle}>{t.serverOnlyYou}</Text>
          <ListRow
            leading={<IconTile name="user-plus" />}
            title={t.allowSignups}
            subtitle={server.signups_forced_by_server ? t.signupsForced : server.signups_open ? t.signupsOpen : t.signupsClosed}
            trailing={
              <Switch
                accessibilityLabel={t.allowSignups}
                trackColor={track} thumbColor={colors.ink}
                value={server.signups_open || server.signups_forced_by_server}
                disabled={server.signups_forced_by_server}
                onValueChange={(next) => void setSignups(next)}
              />
            }
          />
        </Card>
      ) : null}
      <Button title={t.signOut} onPress={() => void signOut()} />
    </Screen>
  );
}
