import { Tabs } from "expo-router/js-tabs";
import { DriftTabBar } from "@/components/tab-bar";
import { colors } from "@/components/theme";

// Drift's floating bar replaces the system tab bar: Today, Plan, [Capture], Momentum, More.
// Tasks moved into More (and Today lists what's due), as in the web version.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <DriftTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.shell } }}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
      <Tabs.Screen name="focus" options={{ title: "Momentum" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
