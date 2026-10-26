import { useEffect, useState } from "react";
import { Button, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getSupabase } from "@/lib/supabase";

export default function Settings() {
  const { data } = useDashboardData();
  const [lock, setLock] = useState(true);

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
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
          value={lock}
          onValueChange={(next) => {
            setLock(next);
            void setAppLockEnabled(next);
          }}
        />
      </View>
      <Button title="Sign out" color="#c0392b" onPress={() => getSupabase().auth.signOut()} />
    </Screen>
  );
}
