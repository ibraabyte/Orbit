import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { AuthPage, authStyles as styles, Field } from "@/components/auth-panel";
import { Button } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { deviceTimeZone, MIN_PASSWORD_LENGTH, signUpProblem } from "@/lib/sign-up";

// Only reachable when Orbit's own server says sign-ups are open (always true for the first account).
export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = signUpProblem({ email, password, confirm });
  const mismatch = confirm && password !== confirm ? problem : null;

  async function signUp() {
    if (problem) return Alert.alert(t.checkForm, problem);
    setBusy(true);
    try {
      // Success signs in; the root layout then swaps to the app.
      await getApi().signUp({ email, password, displayName: name, timezone: deviceTimeZone() });
    } catch (error) {
      Alert.alert(t.signUpFailed, error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage>
      <Text style={styles.title}>{t.signUp}</Text>
      <Field label={t.nameOpt} autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
      <Field label={t.email} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} style={{ writingDirection: "ltr" }} />
      <Field label={`${t.password} (${MIN_PASSWORD_LENGTH}+)`} secureTextEntry autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} style={{ writingDirection: "ltr" }} />
      <Field label={t.confirm} error={mismatch} secureTextEntry autoComplete="new-password" textContentType="newPassword" value={confirm} onChangeText={setConfirm} onSubmitEditing={signUp} style={{ writingDirection: "ltr" }} />
      <Button title={busy ? `${t.loading}…` : t.signUp} disabled={busy || !email || !password || !confirm} onPress={signUp} />
      <Link href="/sign-in" style={styles.link}>
        {t.haveAccount} {t.signIn}
      </Link>
    </AuthPage>
  );
}
