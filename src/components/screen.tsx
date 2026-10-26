import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const tones = { danger: "#c0392b", warning: "#b7791f", success: "#2f855a", neutral: "#6b6b70", default: "#6b6b70" } as const;
export type Tone = keyof typeof tones;

// title: large title for tab screens; omit it on stack screens that show a native header.
export function Screen({ title, refreshing, onRefresh, children }: { title?: string; refreshing?: boolean; onRefresh?: () => void; children: ReactNode }) {
  const scroll = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
    >
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </ScrollView>
  );
  return title ? (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {scroll}
    </SafeAreaView>
  ) : (
    <View style={styles.safe}>{scroll}</View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.label}>{title}</Text>
      {children}
    </View>
  );
}

export function Stats({ items }: { items: readonly (readonly [string, string | number])[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map(([label, value]) => (
        <View key={label} style={[ui.card, { width: "31.5%" }]}>
          <Text style={ui.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[ui.body, { fontSize: 20, fontWeight: "600" }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Row({ title, detail, right, tone, onPress, href }: { title: string; detail?: string | null; right?: string; tone?: Tone; onPress?: () => void; href?: Href }) {
  const body = (
    <View style={[ui.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tones[tone] }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.body}>{title}</Text>
        {detail ? <Text style={ui.muted}>{detail}</Text> : null}
      </View>
      {right ? <Text style={[ui.muted, { fontWeight: "600" }]}>{right}</Text> : null}
    </View>
  );
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link">{body}</Pressable>
      </Link>
    );
  }
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Empty({ children }: { children: string }) {
  return <Text style={ui.muted}>{children}</Text>;
}

export function Segments<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (next: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#e5e5ea", borderRadius: 10, padding: 2 }} accessibilityRole="tablist">
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          accessibilityRole="tab"
          accessibilityState={{ selected: option === value }}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: option === value ? "#fff" : "transparent" }}
        >
          <Text style={{ fontSize: 15, fontWeight: option === value ? "600" : "400", textTransform: "capitalize" }}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const ui = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 4 },
  label: { fontSize: 13, color: "#6b6b70", textTransform: "uppercase" },
  body: { fontSize: 17, color: "#111" },
  muted: { fontSize: 15, color: "#6b6b70" },
  error: { fontSize: 15, color: "#c0392b" }
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f2f2f7" },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontSize: 34, fontWeight: "700", color: "#111" }
});
