import { useEffect, useState } from "react";
import { Switch } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Card, IconTile, ListRow } from "@/components/drift";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { arePrayerAlertsEnabled, setPrayerAlertsEnabled } from "@/hooks/use-prayer-times";
import { signOut } from "@/lib/backend";

export default function Settings() {
  const { data } = useDashboardData();
  const [lock, setLock] = useState(true);
  const [prayers, setPrayers] = useState(true);

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void arePrayerAlertsEnabled().then(setPrayers);
  }, []);

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
      <Button variant="danger" title="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}
