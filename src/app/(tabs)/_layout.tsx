import { Tabs } from "expo-router/js-tabs";
import { DriftTabBar } from "@/components/tab-bar";
import { colors } from "@/components/theme";

// Drift's bar replaces the system tab bar: Today, Plan, [Capture], Momentum, More.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <DriftTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.shell } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="focus" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
