import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { resyncWidget } from "@/hooks/use-widget-sync";
import { Avatar, Card, Chevron, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { clearAskConsent, loadAskConsent } from "@/hooks/use-ask-consent";
import { loadMorningSettings, saveMorningSettings } from "@/hooks/use-morning-brief";
import { arePrayerAlertsEnabled, setPrayerAlertsEnabled } from "@/hooks/use-prayer-times";
import { getApi, signOut } from "@/lib/backend";
import { formatClock, t, toggleLanguage } from "@/lib/i18n";
import { adminApi, type ServerSettings } from "@/lib/integrations";
import { MORNING_DEFAULT, type MorningSettings } from "@/lib/morning-brief";

function Setting({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderTopWidth: 1, borderTopColor: colors.surfaceInset }}>
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
  const [prayers, setPrayers] = useState(true);
  const [morning, setMorning] = useState<MorningSettings>(MORNING_DEFAULT);
  // The AI the person agreed to send their data to for Ask Orbit; null when not agreed.
  const [askConsent, setAskConsent] = useState<string | null>(null);
  // Only the server's admin (the first account) sees the Server card.
  const [server, setServer] = useState<ServerSettings | null>(null);
  const name = data.profile?.display_name ?? "Orbit";

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void arePrayerAlertsEnabled().then(setPrayers);
    void loadMorningSettings().then(setMorning);
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

  // Shown only once saved, so a change that failed never looks like it worked.
  const changeMorning = async (next: MorningSettings) => {
    try {
      await saveMorningSettings(next);
      setMorning(next);
    } catch {
      Alert.alert(t.changeFailed, t.tryAgain);
    }
  };
  const clockAt = (hour: number, minute: number) => formatClock(new Date(2000, 0, 1, hour, minute));
  const pickMorningTime = () =>
    sheet({
      title: t.morningAlertTime,
      options: Array.from({ length: 12 }, (_, index) => ({ hour: 5 + Math.floor(index / 2), minute: (index % 2) * 30 })).map(({ hour, minute }) => ({
        label: `${morning.hour === hour && morning.minute === minute ? "● " : "○ "}${clockAt(hour, minute)}`,
        run: () => void changeMorning({ ...morning, hour, minute })
      }))
    });

  const track = { true: colors.accent, false: colors.hairline };

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}>
        <Avatar name={name} size={48} dark />
        <Text style={[type.title, { flex: 1, fontSize: 16 }]}>{name}</Text>
      </Card>
      <Card style={{ paddingVertical: 0, gap: 0, overflow: "hidden" }}>
        <View style={{ marginTop: -1 }}>
          <Setting label={t.faceId}>
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
        </View>
        <Setting label={t.prayerAlerts} detail={t.prayerSource}>
          <Switch
            accessibilityLabel={t.prayerAlerts}
            trackColor={track} thumbColor={colors.ink}
            value={prayers}
            onValueChange={(next) => {
              setPrayers(next);
              void setPrayerAlertsEnabled(next);
            }}
          />
        </Setting>
        <Setting label={t.morningAlert} detail={t.morningAlertDetail}>
          <Switch accessibilityLabel={t.morningAlert} trackColor={track} thumbColor={colors.ink} value={morning.enabled} onValueChange={(next) => void changeMorning({ ...morning, enabled: next })} />
        </Setting>
        {morning.enabled ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.morningAlertTime}, ${clockAt(morning.hour, morning.minute)}`} onPress={pickMorningTime}>
            <Setting label={t.morningAlertTime}>
              <Text style={type.rowSubtitle}>{clockAt(morning.hour, morning.minute)}</Text>
              <Chevron />
            </Setting>
          </Pressable>
        ) : null}
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
