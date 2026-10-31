import { StyleSheet } from "react-native";
import { colors, fonts } from "@/components/theme";

// Shared by the sign-in and sign-up screens: Drift's dark background, cream fields, lime button.
export const authStyles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.shell },
  title: { fontFamily: fonts.bold, fontSize: 34, color: colors.onShell, marginBottom: 12 },
  link: { fontFamily: fonts.semibold, color: colors.accent, fontSize: 16, textAlign: "center", paddingVertical: 8 },
  hint: { fontFamily: fonts.medium, color: colors.onShellMuted, fontSize: 13 }
});
