import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { type } from "@/components/drift";
import { useReduceMotion } from "@/components/motion";
import { colors, fonts, radius } from "@/components/theme";

// Auth fills the screen with the card colour. On iPad the form keeps a phone width, centered.
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The Refined header: the sand Trail mark on a dark tile, the name, and what this page does (Sign in, Create account).
// On open the tile settles in and the mark turns a quarter into place, then the words fade up. Once, and not with Reduce Motion.
export function AuthHeader({ subtitle }: { subtitle: string }) {
  const reduce = useReduceMotion();
  const mark = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.timing(mark, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.timing(words, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]);
    run.start();
    return () => run.stop();
  }, [mark, words]);
  const tile = reduce ? null : { opacity: mark.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] };
  const turn = reduce ? null : { transform: [{ rotate: mark.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) }] };
  const lift = reduce ? null : { opacity: words, transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] };
  return (
    <View style={styles.header}>
      <Animated.View style={[styles.markTile, tile]} accessibilityRole="image" accessibilityLabel="Orbit">
        <Animated.Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={[styles.mark, turn]} />
      </Animated.View>
      <Animated.View style={lift}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Orbit
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </View>
  );
}

export function Field({ label, error, style, trailing, ...props }: TextInputProps & { label: string; error?: string | null; trailing?: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} style={[styles.input, style]} {...props} />
        {trailing}
      </View>
      {error ? <Text style={[type.tileLabel, { color: colors.dangerOnShell }]}>! {error}</Text> : null}
    </View>
  );
}

export const authStyles = StyleSheet.create({
  link: { fontFamily: fonts.medium, color: colors.link, fontSize: 14, textAlign: "center", paddingVertical: 12 }
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 28, paddingTop: 98, paddingBottom: 32, gap: 18 },
  header: { gap: 18 },
  markTile: { width: 56, height: 56, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.shell, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  mark: { width: 30, height: 30 },
  wordmark: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 30, lineHeight: 36, color: colors.onShell },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  inputWrap: { minHeight: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: "#26262a" },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14, fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  inputError: { borderWidth: 2, borderColor: colors.dangerOnShell }
});
