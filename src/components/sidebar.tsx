import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import { useRef, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Icon, type, type IconName } from "@/components/drift";
import { openCapture, useSidebar } from "@/components/screen";
import { useSectionCounts, useVisibleSections } from "@/components/sections";
import { colors, fonts, radius } from "@/components/theme";
import { formatNumber, t } from "@/lib/i18n";
import { activeKey, SIDEBAR_WIDTH, sidebarSteps } from "@/lib/sidebar";

// iPad: a floating Liquid Glass sidebar at the start edge replaces the tab bar. It holds the assistant (the one sand
// button), Today and More, then every section from More, so any part of Orbit is one tap away. On a phone, or a narrow
// split view, this renders the screen alone and the tab bar stays.
export function SidebarLayout({ children }: { children: ReactNode }) {
  if (!useSidebar()) return <>{children}</>;
  return (
    <View style={styles.layout}>
      <Sidebar />
      <View style={styles.main}>{children}</View>
    </View>
  );
}

function go(from: string, to: string) {
  for (const step of sidebarSteps(from, to)) {
    if (step.kind === "dismissAll") {
      if (router.canDismiss()) router.dismissAll();
    } else router[step.kind](step.href as never);
  }
}

function Sidebar() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const counts = useSectionCounts();
  const { groups } = useVisibleSections();
  // While a sheet (the assistant) is open, the item under it stays lit.
  const lastKey = useRef("index");
  const key = activeKey(path);
  if (key) lastKey.current = key;
  const active = lastKey.current;

  return (
    <View style={[styles.rail, { paddingTop: insets.top + 8, paddingBottom: Math.max(12, insets.bottom) }]}>
      <Glass tint="rgba(10,10,11,0.6)" style={styles.panel}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>Orbit</Text>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openCapture();
            }}
            accessibilityRole="button"
            accessibilityLabel={t.assistantTitle}
            style={({ pressed }) => [styles.assistant, pressed && { opacity: 0.85 }]}
          >
            <Icon name="mic" size={18} color={colors.accentInk} />
            <Text style={styles.assistantText} numberOfLines={1}>
              {t.assistantTitle}
            </Text>
          </Pressable>
          <View accessibilityRole="tablist">
            <Item icon="sun" label={t.today} selected={active === "index"} onPress={() => go(path, "/")} tab />
            <Item icon="grid" label={t.more} selected={active === "more"} onPress={() => go(path, "/more")} tab />
          </View>
          {groups.map(([label, items]) => (
            <View key={label} style={styles.group}>
              <Text style={[type.shellLabel, styles.groupLabel]}>{label}</Text>
              {items.map((item) => (
                <Item key={item.key} icon={item.icon} label={item.label} count={counts[item.key]} selected={active === item.key} onPress={() => go(path, `/${item.key}`)} />
              ))}
            </View>
          ))}
        </ScrollView>
      </Glass>
    </View>
  );
}

function Item({ icon, label, count, selected, onPress, tab }: { icon: IconName; label: string; count?: number; selected: boolean; onPress: () => void; tab?: boolean }) {
  const tint = selected ? colors.accent : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={tab ? "tab" : "link"}
      accessibilityState={{ selected }}
      accessibilityLabel={count ? `${label}, ${formatNumber(count)}` : label}
      style={({ pressed }) => [styles.item, selected && styles.itemSelected, pressed && { opacity: 0.7 }]}
    >
      {/* The open item: sand text and a short sand line at its start, as on the phone's tab bar. */}
      <View style={[styles.mark, selected && { backgroundColor: colors.accent }]} />
      <Icon name={icon} size={17} color={selected ? colors.accent : colors.inkMuted} />
      <Text style={[styles.itemText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      {count ? <Text style={[type.badge, { color: colors.accent }]}>{formatNumber(count)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: "row", backgroundColor: colors.shell },
  main: { flex: 1 },
  rail: { width: SIDEBAR_WIDTH, paddingStart: 12, paddingEnd: 4 },
  panel: { flex: 1, borderRadius: 28, overflow: "hidden" },
  content: { padding: 12, gap: 6 },
  brand: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.3, color: colors.ink, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  assistant: { minHeight: 48, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  assistantText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentInk },
  group: { gap: 0, paddingTop: 10 },
  groupLabel: { paddingHorizontal: 12, paddingBottom: 4 },
  item: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingStart: 10, paddingEnd: 12, borderRadius: radius.tile, borderCurve: "continuous" },
  itemSelected: { backgroundColor: colors.accentTint },
  mark: { width: 2, height: 18, borderRadius: 1, backgroundColor: "transparent" },
  itemText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 }
});
