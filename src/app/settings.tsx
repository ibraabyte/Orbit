import { useEffect, useState } from "react";
import { Alert, Switch } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Card, IconTile, ListRow } from "@/components/drift";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { arePrayerAlertsEnabled, setPrayerAlertsEnabled } from "@/hooks/use-prayer-times";
import { getApi, signOut } from "@/lib/backend";
import { adminApi, type ServerSettings } from "@/lib/integrations";

export default function Settings() {
  const { data } = useDashboardData();
  const [lock, setLock] = useState(true);
  const [prayers, setPrayers] = useState(true);
  // Only the server's admin (the first account) sees the Server card.
  const [server, setServer] = useState<ServerSettings | null>(null);

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
      Alert.alert("Couldn't change it", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <Screen>
      <Card title="Account">
        <ListRow leading={<IconTile name="user" />} title={data.profile?.display_name ?? "Orbit user"} subtitle="Signed in on Orbit's own server" />
      </Card>
      <Card title="Privacy and alerts" kicker="Stored on this phone.">
        <ListRow
          leading={<IconTile name="lock" />}
          title="Lock with Face ID"
          subtitle="On launch and when you come back"
          trailing={
            <Switch
              trackColor={{ true: colors.accentDeep, false: colors.hairline }}
              value={lock}
              onValueChange={(next) => {
                setLock(next);
                void setAppLockEnabled(next);
              }}
            />
          }
        />
        <ListRow
          leading={<IconTile name="bell" />}
          title="Prayer time alerts"
          subtitle="A notification at each prayer"
          trailing={
            <Switch
              trackColor={{ true: colors.accentDeep, false: colors.hairline }}
              value={prayers}
              onValueChange={(next) => {
                setPrayers(next);
                void setPrayerAlertsEnabled(next);
              }}
            />
          }
        />
      </Card>
      <Card title="Integrations">
        <ListRow leading={<IconTile name="link" />} title="Integrations" subtitle="WHOOP, Seerr and AI, for your account" href="/integrations" chevron />
      </Card>
      {server ? (
        <Card title="Server" kicker="You run this Orbit server. Only you see this.">
          <ListRow
            leading={<IconTile name="user-plus" />}
            title="Allow new sign-ups"
            subtitle={server.signups_forced_by_server ? "Kept open by the server's ORBIT_ALLOW_SIGNUPS setting" : server.signups_open ? "Anyone with the app can create an account" : "Only existing accounts can sign in"}
            trailing={
              <Switch
                trackColor={{ true: colors.accentDeep, false: colors.hairline }}
                value={server.signups_open || server.signups_forced_by_server}
                disabled={server.signups_forced_by_server}
                onValueChange={(next) => void setSignups(next)}
              />
            }
          />
        </Card>
      ) : null}
      <Button variant="danger" title="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}
