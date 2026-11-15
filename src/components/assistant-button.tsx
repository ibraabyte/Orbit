import * as Haptics from "expo-haptics";
import { Image, Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openCapture, useSidebar } from "@/components/screen";
import { colors, radius, shadow, usePalette } from "@/components/theme";
import { t } from "@/lib/i18n";

// The Trail symbol. The file is sand; tintColor redraws it in one colour (a dynamic colour isn't accepted here).
export function OrbitMark({ size, color }: { size: number; color: string }) {
  return <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}

// The native tab bar can't be measured, so its size is set here. On iOS 26 it is a small glass capsule in the middle,
// 60 points tall and 10 below the safe area. Older iOS (a full-width bar, 49 tall) and Android (Material, 80 tall)
// sit on the safe area. With three tabs the middle one is always the screen's centre, so the button is centred there
// and rises RAISE points above the bar.
const SIZE = 64;
const RAISE = 10;
const capsuleBar = process.env.EXPO_OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;
const barTall = capsuleBar ? 60 : process.env.EXPO_OS === "ios" ? 49 : 80;
const barBottom = capsuleBar ? -10 : 0;

// The assistant: a raised sand button with the Orbit mark, laid over the middle tab of the native bar. A tap opens
// Capture to type; a hold opens it already listening.
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
      // Hold: open straight into voice, listening at once.
      onLongPress={() => {
        if (process.env.EXPO_OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        openCapture(undefined, true);
      }}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={t.assistantTitle}
      accessibilityActions={[{ name: "longpress", label: t.micStart }]}
      onAccessibilityAction={({ nativeEvent }) => nativeEvent.actionName === "longpress" && openCapture(undefined, true)}
      style={({ pressed }) => [styles.button, { bottom: insets.bottom + barBottom + barTall + RAISE - SIZE }, pressed && styles.pressed]}
    >
      <OrbitMark size={30} color={palette.accentInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    left: "50%",
    marginLeft: -SIZE / 2,
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
