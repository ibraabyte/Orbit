import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/drift";
import { openCapture, useSidebar } from "@/components/screen";
import { colors, fonts, labelCase } from "@/components/theme";
import { t } from "@/lib/i18n";

// Refined tab bar: a bar docked to the bottom on the card colour with a hairline on top. Each tab is an icon over a
// short label; the open one is sand, its icon on a soft sand pill. The raised sand button in the middle opens the
// assistant.
const tabs: Record<string, { label: string; icon: IconName }> = { index: { label: t.today, icon: "disc" }, more: { label: t.more, icon: "menu" } };

export function DriftTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  // An iPad-sized window shows the sidebar instead (src/components/sidebar.tsx).
  const sidebar = useSidebar();
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const { label, icon } = tabs[route.name];
      const onPress = () => {
        const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      const color = focused ? colors.accent : colors.inkMuted;
      return (
        <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={styles.tab}>
          <View style={[styles.iconPill, focused && { backgroundColor: "rgba(232,200,144,0.14)" }]}>
            <Icon name={icon} size={17} color={color} />
          </View>
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    });

  const assistant = (
    <View key="assistant" style={styles.center}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          openCapture();
        }}
        accessibilityRole="button"
        accessibilityLabel={t.assistantTitle}
        style={({ pressed }) => [styles.assistant, pressed && { opacity: 0.85 }]}
      >
        <Icon name="mic" size={24} color={colors.accentInk} />
      </Pressable>
      <Text style={styles.centerLabel} numberOfLines={1}>
        {t.capture}
      </Text>
    </View>
  );

  if (sidebar) return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(10, insets.bottom - 4) }]}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {[buttons[0], assistant, ...buttons.slice(1)]}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 6 },
  tabs: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", alignSelf: "center", width: "100%", maxWidth: 480, paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "flex-end", gap: 3, paddingVertical: 4 },
  iconPill: { width: 40, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.semibold, fontSize: 10 },
  center: { width: 88, alignItems: "center", paddingBottom: 4 },
  assistant: { width: 56, height: 56, marginTop: -26, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  centerLabel: { marginTop: 5, fontFamily: fonts.medium, fontSize: 10, color: colors.accent, ...labelCase }
});
