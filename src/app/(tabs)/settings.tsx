import { Button, Text, View } from "react-native";
import { Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getSupabase } from "@/lib/supabase";

export default function Settings() {
  const { data } = useDashboardData();

  return (
    <Screen title="Settings">
      <View style={ui.card}>
        <Text style={ui.label}>Signed in as</Text>
        <Text style={ui.body}>{data.profile?.display_name ?? "Orbit user"}</Text>
      </View>
      <Button title="Sign out" color="#c0392b" onPress={() => getSupabase().auth.signOut()} />
    </Screen>
  );
}
