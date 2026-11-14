import * as Haptics from "expo-haptics";
import { Image, Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openCapture, useSidebar } from "@/components/screen";
import { colors, radius, shadow, space, usePalette } from "@/components/theme";
import { t } from "@/lib/i18n";

// The Trail symbol. The file is sand; tintColor redraws it in one colour (a dynamic colour isn't accepted here).
export function OrbitMark({ size, color }: { size: number; color: string }) {
  return <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}

// The native tab bar can't be measured, so its size is set here. On iOS 26 it is a small glass capsule in the middle,
// 60 points tall and 10 below the safe area, so the button sits on the same row at the end edge, like the system's own
// separate search button. Older iOS (a full-width bar, 49 tall) and Android (Material, 80 tall) put it above the bar.
const SIZE = 60;
const capsuleBar = process.env.EXPO_OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;
const barAbove = process.env.EXPO_OS === "ios" ? 49 : 80;

// The assistant: a sand button with the Orbit mark beside the native tab bar. It opens Capture.
// On iPad the sidebar holds it instead.
export function AssistantButton() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  if (useSidebar()) return null;
  return (
    <Pressable
      onPress={() => {
        if (process.env.EXPO_OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openCapture();
      }}
      accessibilityRole="button"
      accessibilityLabel={t.assistantTitle}
      style={({ pressed }) => [styles.button, { bottom: capsuleBar ? insets.bottom - 10 : insets.bottom + barAbove + space.md }, pressed && styles.pressed]}
    >
      <OrbitMark size={28} color={palette.accentInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    end: space.lg,
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadow.floating
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] }
});
