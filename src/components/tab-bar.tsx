import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/drift";
import { openCapture } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import { t } from "@/lib/i18n";

// A docked cream bar: four tabs and the lime Capture button raised in the middle.
const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: t.today, icon: "home" },
  plan: { label: t.plan, icon: "clipboard" },
  focus: { label: t.momentum, icon: "bar-chart-2" },
  more: { label: t.more, icon: "menu" }
};

export function DriftTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const buttons = state.routes
    .filter((route) => tabs[route.name])
    .map((route) => {
      const focused = state.routes[state.index]?.key === route.key;
      const { label, icon } = tabs[route.name];
      const color = focused ? colors.ink : colors.inkFaint;
      const onPress = () => {
        const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
      };
      return (
        <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={styles.tab}>
          <View style={[styles.iconWell, focused && styles.iconWellOn]}>
            <Icon name={icon} size={18} color={color} />
          </View>
          <Text style={[styles.label, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    });

  const capture = (
    <View key="capture" style={styles.fabSlot}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          openCapture();
        }}
        accessibilityRole="button"
        accessibilityLabel={t.capture}
        style={styles.fab}
      >
        <Icon name="plus" size={28} color={colors.accentInk} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]} accessibilityRole="tablist">
      {[...buttons.slice(0, 2), capture, ...buttons.slice(2)]}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline, paddingHorizontal: 8, paddingTop: 6 },
  tab: { flex: 1, minHeight: 48, alignItems: "center", gap: 3, paddingVertical: 4 },
  iconWell: { width: 40, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  iconWellOn: { backgroundColor: colors.accent },
  label: { fontFamily: fonts.bold, fontSize: 10 },
  fabSlot: { width: 72, alignItems: "center" },
  fab: { width: 56, height: 56, marginTop: -26, marginBottom: 6, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
});
