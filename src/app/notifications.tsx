import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ConnectionTile, TileGrid } from "@/components/ai-provider-parts";
import { Card, Chevron, IconTile, type, type IconName } from "@/components/drift";
import { ChoiceMenu } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors, fonts, radius, space, textSize } from "@/components/theme";
import { loadMorningSettings, saveMorningSettings } from "@/hooks/use-morning-brief";
import { loadNotificationPrefs, saveNotificationPrefs } from "@/hooks/use-notification-prefs";
import { useSections } from "@/hooks/use-sections";
import { st, type SectionKey } from "@/lib/app-sections";
import { digits, formatClock, isArabic, t } from "@/lib/i18n";
import { dx } from "@/lib/documents";
import { rx } from "@/lib/medications";
import { MORNING_DEFAULT, type MorningSettings } from "@/lib/morning-brief";
import { NOTIFICATION_DEFAULT, NOTIFICATION_SECTION, PRAYER_NAMES, type NotificationKind, type NotificationPrefs } from "@/lib/notification-prefs";
import { prayerNamesAr, prayerNamesEn } from "@/lib/prayer-times";

// A row in a card. The top row (first) has no line above it; inset rows sit under the switch they belong to.
function Setting({ label, detail, first, inset, children }: { label: string; detail?: string; first?: boolean; inset?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: inset ? 44 : 52, paddingVertical: inset ? 6 : 10, paddingStart: inset ? 16 : 0, borderTopWidth: first ? 0 : 1, borderTopColor: colors.surfaceInset }}>
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text style={inset ? type.rowSubtitle : type.rowTitle}>{label}</Text>
        {detail ? <Text style={type.rowSubtitle}>{digits(detail)}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const clockAt = (hour: number, minute: number) => formatClock(new Date(2000, 0, 1, hour, minute));
const prayerName = isArabic ? prayerNamesAr : prayerNamesEn;

export default function NotificationsScreen() {
  const sections = useSections();
  const [prefs, setPrefs] = useState<NotificationPrefs>(NOTIFICATION_DEFAULT);
  const [morning, setMorning] = useState<MorningSettings>(MORNING_DEFAULT);
  // The phone's own switch for Orbit: when it is off, nothing here can arrive.
  const [systemOff, setSystemOff] = useState(false);

  useEffect(() => {
    void loadNotificationPrefs().then(setPrefs);
    void loadMorningSettings().then(setMorning);
    if (Platform.OS !== "web") void Notifications.getPermissionsAsync().then(({ status }) => setSystemOff(status === "denied")).catch(() => undefined);
  }, []);

  // Shown only once saved, so a change that failed never looks like it worked.
  const change = async (next: NotificationPrefs) => {
    try {
      await saveNotificationPrefs(next);
      setPrefs(next);
    } catch {
      Alert.alert(t.changeFailed, t.tryAgain);
    }
  };
  const changeMorning = async (next: MorningSettings) => {
    try {
      await saveMorningSettings(next);
      setMorning(next);
    } catch {
      Alert.alert(t.changeFailed, t.tryAgain);
    }
  };

  // One tile per alert: tap turns it on or off. A kind whose section is off in Settings → Sections stays off and locked.
  const tile = (kind: NotificationKind, icon: IconName, name: string) => {
    const section = NOTIFICATION_SECTION[kind] as SectionKey | null;
    const quiet = section !== null && !sections.on(section);
    const on = !quiet && prefs.kinds[kind];
    return (
      <ConnectionTile
        key={kind}
        mark={<IconTile name={icon} size={36} tone={on ? "sand" : "neutral"} />}
        name={name}
        badge={on ? "check" : null}
        checked={on}
        label={quiet ? `${name}, ${st.quietWithSection(st.names[section!])}` : name}
        onPress={quiet ? undefined : () => void change({ ...prefs, kinds: { ...prefs.kinds, [kind]: !on } })}
      />
    );
  };

  const morningTimes = Array.from({ length: 12 }, (_, index) => ({ hour: 5 + Math.floor(index / 2), minute: (index % 2) * 30 })).map(({ hour, minute }) => ({
    label: clockAt(hour, minute),
    selected: morning.hour === hour && morning.minute === minute,
    run: () => void changeMorning({ ...morning, hour, minute })
  }));
  const headsUpTimes = Array.from({ length: 15 }, (_, index) => 7 + index).map((hour) => ({
    label: clockAt(hour, 0),
    selected: prefs.headsUp.hour === hour && prefs.headsUp.minute === 0,
    run: () => void change({ ...prefs, headsUp: { hour, minute: 0 } })
  }));

  const moneyOn = prefs.kinds.bills || prefs.kinds.installments || prefs.kinds.car || prefs.kinds.documents;

  return (
    <Screen>
      {systemOff ? (
        <Card style={{ gap: space.md }}>
          <Text style={type.rowTitle}>{t.notifSystemOff}</Text>
          <Button variant="outline" title={t.notifOpenSettings} onPress={() => void Linking.openSettings()} />
        </Card>
      ) : null}
      <TileGrid>
        {tile("prayer", "moon", t.notifPrayer)}
        {tile("reminders", "check-square", t.notifReminders)}
        <ConnectionTile
          mark={<IconTile name="sun" size={36} tone={morning.enabled ? "sand" : "neutral"} />}
          name={t.morningAlert}
          badge={morning.enabled ? "check" : null}
          checked={morning.enabled}
          label={t.morningAlert}
          onPress={() => void changeMorning({ ...morning, enabled: !morning.enabled })}
        />
        {tile("medications", "pills", rx.notifDoses)}
        {tile("medStock", "package", rx.notifStock)}
        {tile("bills", "credit-card", t.notifBills)}
        {tile("installments", "calendar", t.notifInstallments)}
        {tile("car", "truck", t.notifCar)}
        {tile("documents", "file-text", dx.notif)}
        {tile("budget", "pie-chart", t.notifBudget)}
        {tile("rest", "clock", t.notifRest)}
      </TileGrid>
      {prefs.kinds.prayer || morning.enabled || moneyOn ? (
        <Card list>
          {prefs.kinds.prayer ? (
            <View style={styles.prayers} accessibilityLabel={t.notifPrayer}>
              {PRAYER_NAMES.map((name) => {
                const on = prefs.prayers[name];
                return (
                  <Pressable key={name} onPress={() => void change({ ...prefs, prayers: { ...prefs.prayers, [name]: !on } })} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={`${t.notifPrayer}, ${prayerName[name]}`} style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && { opacity: 0.7 }]}>
                    <Text style={[styles.pillText, on && { color: colors.urgentInk }]} numberOfLines={1}>
                      {prayerName[name]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {morning.enabled ? (
            <ChoiceMenu fill title={t.morningAlertTime} choices={morningTimes}>
              <View accessible accessibilityRole="button" accessibilityLabel={`${t.morningAlert}, ${clockAt(morning.hour, morning.minute)}`}>
                <Setting first={!prefs.kinds.prayer} label={t.morningAlert}>
                  <Text style={type.rowSubtitle}>{clockAt(morning.hour, morning.minute)}</Text>
                  <Chevron />
                </Setting>
              </View>
            </ChoiceMenu>
          ) : null}
          {moneyOn ? (
            <ChoiceMenu fill title={t.notifHeadsUpTime} choices={headsUpTimes}>
              <View accessible accessibilityRole="button" accessibilityLabel={`${t.notifHeadsUpTime}, ${clockAt(prefs.headsUp.hour, prefs.headsUp.minute)}`}>
                <Setting first={!prefs.kinds.prayer && !morning.enabled} label={t.notifHeadsUpTime}>
                  <Text style={type.rowSubtitle}>{clockAt(prefs.headsUp.hour, prefs.headsUp.minute)}</Text>
                  <Chevron />
                </Setting>
              </View>
            </ChoiceMenu>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prayers: { flexDirection: "row", gap: space.xs, paddingVertical: space.md },
  // Same pills as Settings: quiet beige, dark when on.
  pill: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceInset },
  pillOn: { backgroundColor: colors.urgent },
  pillText: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.ink }
});
