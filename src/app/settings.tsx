import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Alert, DevSettings, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { resyncWidget } from "@/hooks/use-widget-sync";
import { Avatar, Card, IconTile, ListRow, type } from "@/components/drift";
import { ChoiceMenu, useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors, currentAppearance, setAppearance, space, textSize, type AppearanceChoice } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { clearAskConsent, loadAskConsent } from "@/hooks/use-ask-consent";
import { st } from "@/lib/app-sections";
import { getApi, signOut } from "@/lib/backend";
import { currentNumerals, saveNumerals, t, toggleLanguage } from "@/lib/i18n";
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
  const lookChoices = (["system", "light", "dark"] as const).map((choice) => ({ label: lookLabel[choice], selected: choice === look, run: () => (setAppearance(choice), setLook(choice)) }));
  const numeralsLabel = { arab: t.numeralsArab, latn: t.numeralsLatn };
  const numeralChoices = (["arab", "latn"] as const).map((choice) => ({ label: numeralsLabel[choice], selected: choice === numerals, run: () => changeNumerals(choice) }));

  const track = { true: colors.accent, false: colors.hairline };

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: space.lg }}>
        <Avatar name={name} size={48} dark />
        <Text style={[type.title, { flex: 1, fontSize: textSize.callout }]}>{name}</Text>
      </Card>
      {/* Grouped lists, like the system Settings: where to go first, then this phone's preferences, then the server. */}
      <Card list>
        <ListRow first leading={<IconTile name="layers" />} title={st.sections} meta={st.sectionsCount(sectionsOff.length)} href="/sections" />
        <ListRow leading={<IconTile name="bell" />} title={t.notifications} subtitle={t.notificationsDetail} href="/notifications" />
        <ListRow leading={<IconTile name="link" />} title={t.integrations} subtitle={t.integrationsDetail} href="/integrations" />
      </Card>
      <Card list>
        <ListRow
          first
          leading={<IconTile name="lock" />}
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
        <ListRow
          leading={<IconTile name="globe" />}
          title={t.language}
          meta={t.langLabel}
          chevron
          onPress={() => {
            const message = toggleLanguage();
            if (message) toast(message);
          }}
        />
        <ChoiceMenu fill title={t.appearance} choices={lookChoices}>
          <ListRow leading={<IconTile name="moon" />} title={t.appearance} meta={lookLabel[look]} chevron />
        </ChoiceMenu>
        <ChoiceMenu fill title={t.numerals} choices={numeralChoices}>
          <ListRow leading={<IconTile name="hash" />} title={t.numerals} meta={numeralsLabel[numerals]} chevron />
        </ChoiceMenu>
      </Card>
      {askConsent ? (
        <Card>
          <Text style={type.rowTitle}>{t.askShare}</Text>
          <Text style={type.rowSubtitle}>{t.askShareDetail.replace("{provider}", askConsent)}</Text>
          <Button variant="outline" title={t.askWithdraw} onPress={() => void withdrawAsk()} />
        </Card>
      ) : null}
      {server ? (
        <Card list>
          <ListRow
            first
            leading={<IconTile name="user-plus" />}
            title={t.allowSignups}
            subtitle={`${server.signups_forced_by_server ? t.signupsForced : server.signups_open ? t.signupsOpen : t.signupsClosed} · ${t.serverOnlyYou}`}
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
        </Card>
      ) : null}
      <Button title={t.signOut} onPress={() => void signOut()} />
    </Screen>
  );
}
