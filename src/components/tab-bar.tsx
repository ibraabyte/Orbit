import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/drift";
import { colors, fonts } from "@/components/theme";

// The web version's bottom nav: a floating cream bar, four tabs, and a lime Capture button in the middle.
const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Today", icon: "home" },
  plan: { label: "Plan", icon: "clipboard" },
  focus: { label: "Momentum", icon: "bar-chart-2" },
  more: { label: "More", icon: "menu" }
};

export function DriftTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const { label, icon } = tabs[route.name];
      const color = focused ? colors.ink : colors.navInactive;
      const onPress = () => {
        const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      return (
        <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={styles.tab}>
          <View style={[styles.iconWell, focused && styles.iconWellOn]}>
            <Icon name={icon} size={20} color={color} />
          </View>
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    });

  const capture = (
    <Pressable
      key="capture"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/capture");
      }}
      accessibilityRole="button"
      accessibilityLabel="Capture"
      style={styles.fab}
    >
      <Icon name="plus" size={26} color={colors.accentInk} />
    </Pressable>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {[...buttons.slice(0, 2), capture, ...buttons.slice(2)]}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 4,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10
  },
  tab: { minWidth: 56, alignItems: "center", gap: 2, paddingVertical: 2 },
  iconWell: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 16 },
  iconWellOn: { backgroundColor: colors.accent },
  label: { fontFamily: fonts.semibold, fontSize: 10 },
  fab: {
    marginTop: -32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  }
});
