import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Glass, Icon, type IconName } from "@/components/drift";
import { openCapture } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import { t } from "@/lib/i18n";

// A floating glass capsule with four tabs, and the lime glass Capture button beside it.
const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: t.today, icon: "home" },
  plan: { label: t.plan, icon: "clipboard" },
  focus: { label: t.momentum, icon: "bar-chart-2" },
  more: { label: t.more, icon: "menu" }
};

export function DriftTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  // On iPad the bar keeps a phone width, centered, instead of spreading across the screen.
  const side = Math.max(16, (useWindowDimensions().width - 560) / 2);
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const { label, icon } = tabs[route.name];
      const color = focused ? colors.accent : colors.inkMuted;
      const onPress = () => {
        const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      return (
        <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={[styles.tab, focused && styles.tabOn]}>
          <Icon name={icon} size={19} color={color} />
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    });

  return (
    <View style={[styles.bar, { left: side, right: side, bottom: Math.max(14, insets.bottom - 6) }]}>
      <Glass tint="rgba(12,18,14,0.55)" style={styles.capsule}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {buttons}
        </View>
      </Glass>
      <Glass tint={colors.accent} interactive style={styles.capture}>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openCapture();
          }}
          accessibilityRole="button"
          accessibilityLabel={t.assistantTitle}
          style={styles.capturePress}
        >
          <Icon name="mic" size={24} color={colors.accentInk} />
        </Pressable>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  capsule: { flex: 1, height: 64, borderRadius: 32 },
  tabs: { flex: 1, flexDirection: "row", padding: 5 },
  tab: { flex: 1, borderRadius: 27, alignItems: "center", justifyContent: "center", gap: 3 },
  tabOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  label: { fontFamily: fonts.bold, fontSize: 10 },
  capture: { width: 64, height: 64, borderRadius: 32 },
  capturePress: { flex: 1, alignItems: "center", justifyContent: "center" }
});
