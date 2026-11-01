import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AuthPage, authStyles as styles, Field } from "@/components/auth-panel";
import { Brand, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { t, toggleLanguage } from "@/lib/i18n";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupsOpen, setSignupsOpen] = useState(false);

  // Orbit's server allows the first account, then closes sign-ups unless the owner opens them.
  useEffect(() => {
    void getApi()
      .signupsOpen()
      .then(setSignupsOpen)
      .catch(() => setSignupsOpen(false));
  }, []);

  async function signIn() {
    setBusy(true);
    try {
      await getApi().signIn(email, password);
    } catch (error) {
      Alert.alert(t.signInFailed, error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage>
      <Brand />
      <View>
        <Text style={styles.title}>Orbit</Text>
        <Text style={styles.subtitle}>{t.signIn}</Text>
      </View>
      <Field label={t.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} style={{ writingDirection: "ltr" }} />
      <Field label={t.password} secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={signIn} style={{ writingDirection: "ltr" }} />
      <Button title={busy ? `${t.loading}…` : t.signIn} disabled={busy || !email || !password} onPress={signIn} />
      {signupsOpen ? (
        <Link href="/sign-up" style={styles.link}>
          {t.noAccount} {t.signUp}
        </Link>
      ) : null}
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => {
          const message = toggleLanguage();
          if (message) Alert.alert(t.language, message);
        }}
        accessibilityRole="button" style={{ alignItems: "center", minHeight: 40, justifyContent: "center" }}>
        <Text style={[type.pill, { fontSize: 13 }]}>{t.langLabel}</Text>
      </Pressable>
    </AuthPage>
  );
}
