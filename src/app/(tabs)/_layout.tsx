import { NativeTabs } from "expo-router/native-tabs";
import { colors, fonts } from "@/components/theme";

export default function TabsLayout() {
  return (
    // Drift: lime for the selected tab on the dark bar. On iOS 26 the system draws the bar itself (dark glass, from app.json).
    <NativeTabs
      tintColor={colors.accent}
      backgroundColor={colors.shell}
      iconColor={{ default: colors.navInactive, selected: colors.accent }}
      labelStyle={{ default: { color: colors.navInactive, fontFamily: fonts.semibold }, selected: { color: colors.accent, fontFamily: fonts.semibold } }}
      blurEffect="systemChromeMaterialDark"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="focus">
        <NativeTabs.Trigger.Icon sf="timer" md="timer" />
        <NativeTabs.Trigger.Label>Focus</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="apps" />
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
