import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Button, KeyboardAvoidingView, Platform, Text, TextInput } from "react-native";
import { authStyles as styles } from "@/components/auth-styles";
import { backendMode, getApi } from "@/lib/backend";
import { getSupabase } from "@/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupsOpen, setSignupsOpen] = useState(false);

  // Orbit's server allows the first account, then closes sign-ups unless the owner opens them.
  useEffect(() => {
    if (backendMode() !== "api") return;
    void getApi()
      .signupsOpen()
      .then(setSignupsOpen)
      .catch(() => setSignupsOpen(false));
  }, []);

  async function signIn() {
    setBusy(true);
    try {
      if (backendMode() === "api") {
        await getApi().signIn(email, password);
      } else {
        const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert("Sign in failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Orbit</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={signIn} />
      <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy || !email || !password} onPress={signIn} />
      {signupsOpen ? (
        <Link href="/sign-up" style={styles.link}>
          Create an account
        </Link>
      ) : null}
    </KeyboardAvoidingView>
  );
}
