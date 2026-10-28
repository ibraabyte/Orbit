import { StyleSheet } from "react-native";

// Shared by the sign-in and sign-up screens.
export const authStyles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: "700", marginBottom: 12 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#999", borderRadius: 10, padding: 14, fontSize: 17 },
  link: { color: "#0a84ff", fontSize: 17, textAlign: "center", paddingVertical: 8 },
  hint: { color: "#888", fontSize: 13 }
});
