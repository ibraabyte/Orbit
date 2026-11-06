import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Glass, Icon } from "@/components/drift";
import { openCapture, useSidebar } from "@/components/screen";
import { colors, fonts, labelCase } from "@/components/theme";
import { t } from "@/lib/i18n";

// Night tab bar: a floating Liquid Glass capsule. Tabs are words in small capitals; the open one is sand with a sand
// line under it. The sand button in the middle opens the assistant.
const tabs: Record<string, string> = { index: t.today, more: t.more };

export function DriftTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  // On iPad the bar keeps a phone width, centered, instead of spreading across the screen.
  const side = Math.max(16, (useWindowDimensions().width - 480) / 2);
  // An iPad-sized window shows the sidebar instead (src/components/sidebar.tsx).
  const sidebar = useSidebar();
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const label = tabs[route.name];
      const onPress = () => {
        const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      return (
        <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={styles.tab}>
          <Text style={[styles.label, { color: focused ? colors.accent : colors.inkMuted }]} numberOfLines={1}>
            {label}
          </Text>
          <View style={[styles.underline, focused && { backgroundColor: colors.accent }]} />
        </Pressable>
      );
    });

  const assistant = (
    <Pressable
      key="assistant"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openCapture();
      }}
      accessibilityRole="button"
      accessibilityLabel={t.assistantTitle}
      style={styles.assistant}
    >
      <Icon name="mic" size={22} color={colors.accentInk} />
    </Pressable>
  );

  if (sidebar) return null;
  return (
    <View style={[styles.bar, { left: side, right: side, bottom: Math.max(14, insets.bottom - 6) }]}>
      <Glass tint="rgba(10,10,11,0.6)" style={styles.capsule}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {[buttons[0], assistant, ...buttons.slice(1)]}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute" },
  capsule: { height: 64, borderRadius: 32 },
  tabs: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 11, ...labelCase },
  underline: { width: 22, height: 2, borderRadius: 1, backgroundColor: "transparent" },
  assistant: { width: 48, height: 48, borderRadius: 24, marginHorizontal: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }
});
