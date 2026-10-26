import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ title, refreshing, onRefresh, children }: { title: string; refreshing?: boolean; onRefresh?: () => void; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const ui = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 6 },
  label: { fontSize: 13, color: "#6b6b70", textTransform: "uppercase" },
  body: { fontSize: 17, color: "#111" },
  muted: { fontSize: 15, color: "#6b6b70" },
  error: { fontSize: 15, color: "#c0392b" }
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f2f2f7" },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 34, fontWeight: "700", color: "#111", marginBottom: 4 }
});
