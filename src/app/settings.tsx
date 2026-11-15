import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, DevSettings, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { resyncWidget } from "@/hooks/use-widget-sync";
import { Avatar, Card, Icon, IconTile, ListRow, type, type IconName } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors, currentAppearance, fonts, radius, setAppearance, space, textSize, type AppearanceChoice } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { clearAskConsent, loadAskConsent } from "@/hooks/use-ask-consent";
import { st } from "@/lib/app-sections";
import { getApi, signOut } from "@/lib/backend";
import { currentNumerals, isArabic, saveNumerals, t, toggleLanguage } from "@/lib/i18n";
import { adminApi, type ServerSettings } from "@/lib/integrations";
import type { Numerals } from "@/lib/numerals";

export default function Settings() {
  const { data, userId } = useDashboardData();
  const { toast } = useOverlays();
  const [lock, setLock] = useState(true);
  const [numerals, setNumerals] = useState<Numerals>(currentNumerals);
  // The AI the person agreed to send their data to for Ask Orbit; null when not agreed.
  const [askConsent, setAskConsent] = useState<string | null>(null);
  // Only the server's admin (the first account) sees the Server card.
  const [server, setServer] = useState<ServerSettings | null>(null);
  const name = data.profile?.display_name ?? "Orbit";
  const { saved: sectionsOff } = useSections();

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void loadAskConsent(userId).then(setAskConsent);
    void (async () => {
      const api = getApi();
      const me = await adminApi.me(api);
      if (me.is_admin) setServer(await adminApi.settings(api));
    })().catch(() => undefined);
  }, []);

  const setSignups = async (open: boolean) => {
    if (!server) return;
    setServer({ ...server, signups_open: open });
    try {
      setServer(await adminApi.setSignupsOpen(getApi(), open));
    } catch (error) {
      setServer(server);
      Alert.alert(t.changeFailed, error instanceof Error ? error.message : t.tryAgain);
    }
  };

  const withdrawAsk = async () => {
    try {
      await clearAskConsent(userId);
      setAskConsent(null);
      toast(t.askWithdrawn);
    } catch {
      Alert.alert(t.changeFailed, t.tryAgain);
    }
  };

  // Every screen already drawn holds its digits, so the app reloads to redraw them all. No reload (web): ask for a restart.
  const changeNumerals = (next: Numerals) => {
    if (next === numerals) return;
    saveNumerals(next);
    setNumerals(next);
    if (__DEV__ && typeof DevSettings.reload === "function") return DevSettings.reload();
    Updates.reloadAsync().catch(() => toast(t.restartForNumerals));
  };
  const [look, setLook] = useState<AppearanceChoice>(currentAppearance);
  const lookLabel = { system: t.appearanceSystem, light: t.appearanceLight, dark: t.appearanceDark };

  const track = { true: colors.accent, false: colors.hairline };
  // The three places to go, as tiles.
  const places = [
    { href: "/sections", icon: "layers", label: st.sections },
    { href: "/notifications", icon: "bell", label: t.notifications },
    { href: "/integrations", icon: "link", label: t.integrations }
  ] as const;
  const language = isArabic ? "ar" : "en";

  return (
    <Screen>
      {/* You, in the middle; then the places to go; then this phone's choices, changed right here. */}
      <View style={styles.me}>
        <Avatar name={name} size={76} dark />
        <Text style={styles.name}>{name}</Text>
      </View>
      <View style={styles.places}>
        {places.map((place) => (
          <Pressable key={place.href} onPress={() => router.push(place.href)} accessibilityRole="link" style={({ pressed }) => [styles.place, pressed && { opacity: 0.7 }]}>
            <Icon name={place.icon} size={22} color={colors.link} />
            <Text style={type.rowTitle} numberOfLines={1}>
              {place.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* This phone's choices, each a row with its icon and the options as small pills you tap. */}
      <Card list>
        <PickRow icon="moon" title={t.appearance} value={look} onChange={(choice) => (setAppearance(choice), setLook(choice))}
          options={[{ key: "system", icon: "smartphone", label: lookLabel.system }, { key: "light", icon: "sun", label: lookLabel.light }, { key: "dark", icon: "moon", label: lookLabel.dark }]} first />
        <PickRow icon="hash" title={t.numerals} value={numerals} onChange={changeNumerals}
          options={[{ key: "latn", label: "0123" }, { key: "arab", label: "٠١٢٣" }]} />
        <PickRow
          icon="globe"
          title={t.languageShort}
          value={language}
          onChange={(next) => {
            if (next === language) return;
            const message = toggleLanguage();
            if (message) toast(message);
          }}
          options={[{ key: "ar", label: "العربية" }, { key: "en", label: "English" }]}
        />
      </Card>
      <Card list>
        <ListRow
          first
          title={t.faceId}
          trailing={
            <Switch
              accessibilityLabel={t.faceId}
              trackColor={track}
              value={lock}
              onValueChange={(next) => {
                setLock(next);
                void setAppLockEnabled(next).then(resyncWidget);
              }}
            />
          }
        />
        {server ? (
          <ListRow
            title={t.allowSignups}
            subtitle={server.signups_forced_by_server ? t.signupsForced : undefined}
            trailing={
              <Switch
                accessibilityLabel={t.allowSignups}
                trackColor={track}
                value={server.signups_open || server.signups_forced_by_server}
                disabled={server.signups_forced_by_server}
                onValueChange={(next) => void setSignups(next)}
              />
            }
          />
        ) : null}
      </Card>
      {askConsent ? (
        <Card>
          <Text style={type.rowTitle}>{t.askShare}</Text>
          <Text style={type.rowSubtitle}>{t.askShareDetail.replace("{provider}", askConsent)}</Text>
          <Button variant="outline" title={t.askWithdraw} onPress={() => void withdrawAsk()} />
        </Card>
      ) : null}
      <Pressable onPress={() => void signOut()} accessibilityRole="button" style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}>
        <Text style={styles.signOutText}>{t.signOut}</Text>
      </Pressable>
    </Screen>
  );
}

type PickOption<T extends string> = { key: T; label: string; icon?: IconName };

// One choice: its icon and name, then the options as pills; the picked one is filled.
function PickRow<T extends string>({ icon, title, options, value, onChange, first }: { icon: IconName; title: string; options: PickOption<T>[]; value: T; onChange: (next: T) => void; first?: boolean }) {
  return (
    <View style={[styles.pick, !first && styles.pickLine]}>
      <View style={styles.pickHead}>
        <IconTile name={icon} />
        <Text style={type.rowTitle}>{title}</Text>
      </View>
      <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {options.map((option) => {
          const on = option.key === value;
          return (
            <Pressable key={option.key} onPress={() => onChange(option.key)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={option.label} style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && { opacity: 0.7 }]}>
              {option.icon ? <Icon name={option.icon} size={15} color={on ? colors.accentInk : colors.inkMuted} /> : null}
              <Text style={[styles.pillText, on && { color: colors.accentInk }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  me: { alignItems: "center", gap: space.xs, paddingTop: space.sm, paddingBottom: space.xs },
  name: { fontFamily: fonts.bold, fontSize: textSize.title3, color: colors.ink, marginTop: space.xs },
  places: { flexDirection: "row", gap: space.sm },
  place: { flex: 1, alignItems: "center", gap: space.sm, paddingVertical: space.lg, paddingHorizontal: space.sm, borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pick: { gap: space.md, paddingVertical: space.md },
  pickLine: { borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  pickHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  pills: { flexDirection: "row", gap: space.sm },
  pill: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontFamily: fonts.medium, fontSize: textSize.subheadline, color: colors.ink },
  signOut: { alignItems: "center", paddingVertical: space.md },
  signOutText: { fontFamily: fonts.semibold, fontSize: textSize.body, color: colors.dangerOnShell }
});
