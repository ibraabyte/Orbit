import { StyleSheet } from "react-native";
import { colors, fonts } from "@/components/theme";

// Shared by the sign-in and sign-up screens (with AuthPanel in auth-panel.tsx).
export const authStyles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 16, gap: 16, backgroundColor: colors.shell },
  link: { fontFamily: fonts.semibold, color: colors.accent, fontSize: 14, textAlign: "center", paddingVertical: 8 },
  hint: { fontFamily: fonts.medium, color: colors.inkMuted, fontSize: 12.5 }
});
