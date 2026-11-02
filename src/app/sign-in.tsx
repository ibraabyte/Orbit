import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Linking from "expo-linking";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AuthPage, authStyles as styles, Field } from "@/components/auth-panel";
import { Brand, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { t, toggleLanguage } from "@/lib/i18n";
import { deviceTimeZone } from "@/lib/sign-up";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState({ signupsOpen: false, google: false });

  // Orbit's server allows the first account, then closes sign-ups unless the owner opens them.
  useEffect(() => {
    void getApi()
      .authStatus()
      .then(setOptions)
      .catch(() => undefined);
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const returnTo = Linking.createURL("sign-in");
      const { url, secret } = await getApi().startGoogle(returnTo, deviceTimeZone());
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (result.type !== "success") return;
      const { status, code } = Linking.parse(result.url).queryParams ?? {};
      if (status === "ok" && typeof code === "string") await getApi().finishGoogle(code, secret);
      else if (status !== "denied") Alert.alert(t.signInFailed, status === "closed" ? t.googleClosed : status === "unverified" ? t.googleUnverified : t.tryAgain);
    } catch (error) {
      Alert.alert(t.signInFailed, error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  }

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
      {options.google ? (
        <Pressable
          onPress={signInWithGoogle}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, backgroundColor: colors.field, opacity: busy ? 0.45 : pressed ? 0.8 : 1 })}>
          <FontAwesome name="google" size={18} color={colors.ink} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{t.continueWithGoogle}</Text>
        </Pressable>
      ) : null}
      {options.signupsOpen ? (
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
