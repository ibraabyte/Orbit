import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiQuickAdd } from "@/lib/api-actions";
import { backendMode, getApi } from "@/lib/backend";
import { executeQuickAdd } from "@/lib/quick-add-executor";
import { describeDraft, parseNatural } from "@/lib/quick-add-input";

const recentKey = "orbit.quick-add.recent";
// Tap to start a line with the right word; the parser does the rest.
const starters = ["spent ", "slept ", "workout ", "weight ", "buy ", "note "];

// One line in, any record out, in plain English or Arabic: "spent 25 lunch", "نمت 7 ساعات", "call mom tomorrow 9am".
export function QuickAddBar() {
  const { userId, data, refresh } = useDashboardData();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const options = {
    defaultWeightUnit: data.profile?.weight_unit ?? "kg",
    defaultCurrency: data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR"
  };
  const parsed = text.trim() ? parseNatural(text, options) : null;

  useEffect(() => {
    AsyncStorage.getItem(recentKey)
      .then((saved) => setRecent(saved ? JSON.parse(saved) : []))
      .catch(() => undefined);
  }, []);

  async function submit(line = text) {
    if (!line.trim() || busy) return;
    const { draft, validation } = parseNatural(line, options);
    if (!validation.ok) {
      Alert.alert("Almost", validation.message ?? "Try again.");
      return;
    }
    setBusy(true);
    try {
      if (backendMode() === "api") await apiQuickAdd(getApi(), draft);
      else await executeQuickAdd(userId, draft);
      setText("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const next = [line.trim(), ...recent.filter((item) => item !== line.trim())].slice(0, 5);
      setRecent(next);
      void AsyncStorage.setItem(recentKey, JSON.stringify(next)).catch(() => undefined);
      await refresh();
    } catch (error) {
      Alert.alert("Could not add", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function start(word: string) {
    setText(word);
    input.current?.focus();
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        ref={input}
        style={styles.input}
        placeholder="Add anything… spent 25 lunch, call mom tomorrow"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => submit()}
        returnKeyType="done"
        editable={!busy}
      />
      {parsed ? (
        <Text style={[styles.preview, !parsed.validation.ok && styles.warn]} numberOfLines={2}>
          {parsed.validation.ok ? describeDraft(parsed.draft) : parsed.validation.message}
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {/* Recent lines save again in one tap; starters just fill the box. */}
          {recent.map((line) => (
            <Chip key={`r-${line}`} label={`↻ ${line}`} onPress={() => submit(line)} />
          ))}
          {starters.map((word) => (
            <Chip key={word} label={word.trim()} onPress={() => start(word)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.chip}>
      <Text style={{ fontSize: 15 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 17 },
  preview: { fontSize: 15, color: "#2f855a", paddingHorizontal: 4 },
  warn: { color: "#b7791f" },
  chip: { backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 220 }
});
