import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { type } from "@/components/drift";
import { backdrop, colors, fonts, radius } from "@/components/theme";

// Auth sits straight on the backdrop, with no card.
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={type.tileLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} style={[styles.input, error ? styles.inputError : null, style]} {...props} />
      {error ? <Text style={[type.tileLabel, { color: colors.dangerOnShell }]}>! {error}</Text> : null}
    </View>
  );
}

export const authStyles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.ink },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted },
  link: { fontFamily: fonts.semibold, color: colors.link, fontSize: 14, textAlign: "center", paddingVertical: 12 }
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.shell, experimental_backgroundImage: backdrop },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 98, paddingBottom: 40, gap: 16 },
  input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, backgroundColor: colors.surface, fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  inputError: { borderWidth: 2, borderColor: colors.dangerOnShell }
});
