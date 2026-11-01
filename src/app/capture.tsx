import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Icon, type } from "@/components/drift";
import { QuickAddBar } from "@/components/quick-add-bar";
import { colors } from "@/components/theme";

// The lime + in the tab bar opens this: one line in, any record out (the web's Command page).
export default function Capture() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h1}>Capture</Text>
          <Text style={type.shellMeta}>Tasks, spending, sleep, notes. English or Arabic.</Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close}>
          <Icon name="x" size={20} color={colors.onShell} />
        </Pressable>
      </View>
      <Card title="Quick capture" kicker='Try "spent 25 lunch" or "call mom tomorrow 9am".'>
        <QuickAddBar autoFocus onAdded={() => router.back()} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.shell, padding: 16, paddingTop: 24, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(237,240,231,0.2)" }
});
