import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { type } from "@/components/drift";
import { backdrop, colors, fonts, labelCase, radius } from "@/components/theme";
import { useNow } from "@/hooks/use-now";
import { formatClock24, formatDate, t } from "@/lib/i18n";

// Auth sits straight on the backdrop, with no card. On iPad the form keeps a phone width, centered.
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The Night header: the sand mark and wordmark, then the Rail's big clock (sand colon) with the date and a tagline.
export function AuthHeader() {
  const now = useNow();
  const [hours, minutes] = formatClock24(now).split(/[:٫]/);
  return (
    <View style={styles.header}>
      <View style={styles.brandRow} accessibilityRole="image" accessibilityLabel="Orbit">
        <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={styles.mark} />
        <Text style={styles.wordmark}>ORBIT</Text>
      </View>
      <View style={styles.clockBlock}>
        <Text style={styles.date}>{formatDate(now, { weekday: "long", day: "numeric", month: "long" })}</Text>
        <Text style={styles.clock} accessibilityLabel={formatClock24(now)}>
          {hours}
          <Text style={{ color: colors.accent }}>:</Text>
          {minutes}
        </Text>
        <Text style={styles.tagline}>{t.authTagline}</Text>
      </View>
    </View>
  );
}

export function Field({ label, error, style, trailing, ...props }: TextInputProps & { label: string; error?: string | null; trailing?: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.tileLabel}>{label}</Text>
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} style={[styles.input, style]} {...props} />
        {trailing}
      </View>
      {error ? <Text style={[type.tileLabel, { color: colors.dangerOnShell }]}>! {error}</Text> : null}
    </View>
  );
}

export const authStyles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.ink },
  // The form's own heading under the header: a small label with a hairline, like the Rail's section labels.
  section: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted, ...labelCase },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted },
  link: { fontFamily: fonts.semibold, color: colors.link, fontSize: 14, textAlign: "center", paddingVertical: 12 }
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.shell, experimental_backgroundImage: backdrop },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 28, paddingTop: 72, paddingBottom: 32, gap: 16 },
  header: { gap: 40, marginBottom: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 28, height: 28 },
  wordmark: { fontFamily: "JetBrainsMono_500Medium", fontSize: 14, letterSpacing: 5, color: colors.onShell },
  clockBlock: { gap: 6 },
  date: { fontFamily: fonts.regular, fontSize: 12, color: colors.onShellMuted, ...labelCase },
  clock: { fontFamily: "JetBrainsMono_500Medium", fontSize: 72, lineHeight: 76, letterSpacing: -3, color: colors.onShell, writingDirection: "ltr" },
  tagline: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkMuted },
  inputWrap: { minHeight: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14, fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  inputError: { borderWidth: 2, borderColor: colors.dangerOnShell }
});
