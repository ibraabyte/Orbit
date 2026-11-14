import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Glass, Icon, type IconName } from "@/components/drift";
import { openCapture, useSidebar } from "@/components/screen";
import { colors, fonts, radius, shadow, space, textSize } from "@/components/theme";
import { t } from "@/lib/i18n";

// Refined tab bar: a floating Liquid Glass capsule above the bottom edge (solid card colour where glass isn't available).
// Each tab is an icon over a short label; the open one is sand on a soft sand pad. The sand button in the middle opens
// Capture.
const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: t.today, icon: "disc" },
  more: { label: t.more, icon: "menu" },
};

export function DriftTabBar({
  state,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  // An iPad-sized window shows the sidebar instead (src/components/sidebar.tsx).
  const sidebar = useSidebar();
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const { label, icon } = tabs[route.name];
      const onPress = () => {
        const event = emitter.emit({
          type: "tabPress",
          target: route.key,
          canPreventDefault: true,
        });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      const color = focused ? colors.link : colors.inkMuted;
      return (
        <Pressable
          key={route.key}
          onPress={onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: focused }}
          accessibilityLabel={label}
          style={[
            styles.tab,
            focused && { backgroundColor: colors.accentWash },
          ]}
        >
          <Icon name={icon} size={19} color={color} />
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
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
      style={({ pressed }) => [
        styles.assistant,
        pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
      ]}
    >
      <Icon name="mic" size={22} color={colors.accentInk} />
    </Pressable>
  );

  if (sidebar) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { bottom: Math.max(12, insets.bottom - 8) }]}
    >
      <View style={styles.shadow}>
        <Glass interactive style={styles.capsule}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {[buttons[0], assistant, ...buttons.slice(1)]}
          </View>
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: space.lg, right: space.lg, alignItems: "center" },
  shadow: {
    width: "100%",
    maxWidth: 320,
    borderRadius: radius.pill,
    boxShadow: shadow.floating,
  },
  capsule: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.edge,
    overflow: "hidden",
  },
  tabs: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm },
  tab: {
    flex: 1,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  label: { fontFamily: fonts.semibold, fontSize: textSize.caption2 },
  assistant: {
    width: 56,
    height: 56,
    borderRadius: radius.xxl,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
