import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, StyleSheet, TextInput } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { parseQuickAdd } from "@/lib/quick-add";
import { executeQuickAdd } from "@/lib/quick-add-executor";

// One line in, any record out: "buy milk @tomorrow #home", "expense 25 lunch", ...
export function QuickAddBar() {
  const { userId, data, refresh } = useDashboardData();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await executeQuickAdd(userId, parseQuickAdd(text, { defaultWeightUnit: data.profile?.weight_unit ?? "kg" }));
      setText("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (error) {
      Alert.alert("Could not add", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextInput
      style={styles.input}
      placeholder="Add anything… (task, expense 25 lunch, sleep 7h)"
      value={text}
      onChangeText={setText}
      onSubmitEditing={submit}
      returnKeyType="done"
      editable={!busy}
    />
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 17 }
});
