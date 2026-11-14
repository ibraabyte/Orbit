import { NativeTabs } from "expo-router/unstable-native-tabs";
import { View } from "react-native";
import { openCapture, useSidebar } from "@/components/screen";
import { colors } from "@/components/theme";
import { isArabic, t } from "@/lib/i18n";

// The system tab bar (Liquid Glass on iOS 26, Material on Android): Today, the assistant in the middle, and More.
// The assistant is a tab that never opens: tapping it is blocked natively and opens Capture instead, so it sits in the
// bar itself, centred between the two. Its icon is the sand Orbit mark drawn as is ("original"), not tinted.
// The bar takes its direction from the app's language, not the phone's: in Arabic, Today is on the right.
// On iPad the sidebar replaces it (src/components/sidebar.tsx).
export default function TabsLayout() {
  const sidebar = useSidebar();
  return (
    <View style={{ flex: 1, backgroundColor: colors.shell }}>
      <NativeTabs hidden={sidebar} tintColor={colors.link} unstable_nativeProps={{ direction: isArabic ? "rtl" : "ltr" }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} md="today" />
          <NativeTabs.Trigger.Label>{t.today}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="assistant" disabled accessibilityLabel={t.assistantTitle} listeners={{ tabPress: () => openCapture() }}>
          <NativeTabs.Trigger.Icon src={require("../../../assets/brand/night/tab-orbit.png")} renderingMode="original" />
          <NativeTabs.Trigger.Label>{t.capture}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md="apps" />
          <NativeTabs.Trigger.Label>{t.more}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}
