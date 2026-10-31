import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Button, Screen, ui } from "@/components/screen";
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
      <View style={ui.card}>
        <Text style={ui.label}>Signed in as</Text>
        <Text style={ui.body}>{data.profile?.display_name ?? "Orbit user"}</Text>
      </View>
      <View style={[ui.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={ui.body}>Lock with Face ID</Text>
        <Switch
          trackColor={{ true: colors.accentDeep, false: colors.hairline }}
          value={lock}
          onValueChange={(next) => {
            setLock(next);
            void setAppLockEnabled(next);
          }}
        />
      </View>
      <View style={[ui.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={ui.body}>Prayer time alerts</Text>
        <Switch
          trackColor={{ true: colors.accentDeep, false: colors.hairline }}
          value={prayers}
          onValueChange={(next) => {
            setPrayers(next);
            void setPrayerAlertsEnabled(next);
          }}
        />
      </View>
      <Button variant="danger" title="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}
