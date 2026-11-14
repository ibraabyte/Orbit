import { NativeTabs } from "expo-router/unstable-native-tabs";
import { View } from "react-native";
import { AssistantButton } from "@/components/assistant-button";
import { useSidebar } from "@/components/screen";
import { colors } from "@/components/theme";
import { t } from "@/lib/i18n";

// The system tab bar (Liquid Glass on iOS 26, Material on Android): Today and More. The assistant floats above it.
// On iPad the sidebar replaces it (src/components/sidebar.tsx).
export default function TabsLayout() {
  const sidebar = useSidebar();
  return (
    <View style={{ flex: 1, backgroundColor: colors.shell }}>
      <NativeTabs hidden={sidebar} tintColor={colors.link}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} md="today" />
          <NativeTabs.Trigger.Label>{t.today}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md="apps" />
          <NativeTabs.Trigger.Label>{t.more}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <AssistantButton />
    </View>
  );
}
