import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Avatar, Card, Chevron, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { arePrayerAlertsEnabled, setPrayerAlertsEnabled } from "@/hooks/use-prayer-times";
import { getApi, signOut } from "@/lib/backend";
import { t, toggleLanguage } from "@/lib/i18n";
import { adminApi, type ServerSettings } from "@/lib/integrations";

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
  const { data } = useDashboardData();
  const { toast } = useOverlays();
  const [lock, setLock] = useState(true);
  const [prayers, setPrayers] = useState(true);
  // Only the server's admin (the first account) sees the Server card.
  const [server, setServer] = useState<ServerSettings | null>(null);
  const name = data.profile?.display_name ?? "Orbit";

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void arePrayerAlertsEnabled().then(setPrayers);
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
              trackColor={track}
              value={lock}
              onValueChange={(next) => {
                setLock(next);
                void setAppLockEnabled(next);
              }}
            />
          </Setting>
        </View>
        <Setting label={t.prayerAlerts} detail={t.prayerSource}>
          <Switch
            accessibilityLabel={t.prayerAlerts}
            trackColor={track}
            value={prayers}
            onValueChange={(next) => {
              setPrayers(next);
              void setPrayerAlertsEnabled(next);
            }}
          />
        </Setting>
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
                trackColor={track}
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
