import { Link } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Text } from "react-native";
import { AuthPanel, Field } from "@/components/auth-panel";
import { authStyles as styles } from "@/components/auth-styles";
import { Button } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { deviceTimeZone, MIN_PASSWORD_LENGTH, signUpProblem } from "@/lib/sign-up";

// Only reachable when Orbit's own server says sign-ups are open (always true for the first account).
export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = signUpProblem({ email, password, confirm });

  async function signUp() {
    if (problem) return Alert.alert("Check the form", problem);
    setBusy(true);
    try {
      // Success signs in; the root layout then swaps to the app.
      await getApi().signUp({ email, password, displayName: name, timezone: deviceTimeZone() });
    } catch (error) {
      Alert.alert("Sign up failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AuthPanel title="Create your Orbit account" subtitle="Start with tasks, reminders, captures, and health logs in one place.">
        <Field label="Display name (optional)" autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
        <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
        <Field label="Password" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} />
        <Field label="Confirm password" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={confirm} onChangeText={setConfirm} onSubmitEditing={signUp} />
        <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</Text>
        <Button title={busy ? "Creating…" : "Create account"} disabled={busy || !email || !password || !confirm} onPress={signUp} />
      </AuthPanel>
      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </KeyboardAvoidingView>
  );
}
