import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Switch, Text, View } from "react-native";
import { Card, Chevron, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { loadMorningSettings, saveMorningSettings } from "@/hooks/use-morning-brief";
import { loadNotificationPrefs, saveNotificationPrefs } from "@/hooks/use-notification-prefs";
import { useSections } from "@/hooks/use-sections";
import { st, type SectionKey } from "@/lib/app-sections";
import { digits, formatClock, isArabic, t } from "@/lib/i18n";
import { rx } from "@/lib/medications";
import { MORNING_DEFAULT, type MorningSettings } from "@/lib/morning-brief";
import { NOTIFICATION_DEFAULT, NOTIFICATION_SECTION, PRAYER_NAMES, type NotificationKind, type NotificationPrefs } from "@/lib/notification-prefs";
import { prayerNamesAr, prayerNamesEn } from "@/lib/prayer-times";

// A row in a card. The top row (first) has no line above it; inset rows sit under the switch they belong to.
function Setting({ label, detail, first, inset, children }: { label: string; detail?: string; first?: boolean; inset?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: inset ? 44 : 52, paddingVertical: inset ? 6 : 10, paddingStart: inset ? 16 : 0, borderTopWidth: first ? 0 : 1, borderTopColor: colors.surfaceInset }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={inset ? type.rowSubtitle : type.rowTitle}>{label}</Text>
        {detail ? <Text style={type.rowSubtitle}>{digits(detail)}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const track = { true: colors.accent, false: colors.hairline };
const clockAt = (hour: number, minute: number) => formatClock(new Date(2000, 0, 1, hour, minute));
const prayerName = isArabic ? prayerNamesAr : prayerNamesEn;

export default function NotificationsScreen() {
  const { sheet } = useOverlays();
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

  // A kind whose section is switched off in Settings → Sections is quiet whatever its switch says, so it shows off and locked.
  const toggle = (kind: NotificationKind, label: string, detail?: string, first?: boolean) => {
    const section = NOTIFICATION_SECTION[kind] as SectionKey | null;
    const quiet = section !== null && !sections.on(section);
    return (
      <Setting first={first} label={label} detail={quiet ? st.quietWithSection(st.names[section!]) : detail}>
        <Switch accessibilityLabel={label} trackColor={track} thumbColor={colors.ink} value={quiet ? false : prefs.kinds[kind]} disabled={quiet} onValueChange={(on) => void change({ ...prefs, kinds: { ...prefs.kinds, [kind]: on } })} />
      </Setting>
    );
  };

  const pickMorningTime = () =>
    sheet({
      title: t.morningAlertTime,
      options: Array.from({ length: 12 }, (_, index) => ({ hour: 5 + Math.floor(index / 2), minute: (index % 2) * 30 })).map(({ hour, minute }) => ({
        label: `${morning.hour === hour && morning.minute === minute ? "● " : "○ "}${clockAt(hour, minute)}`,
        run: () => void changeMorning({ ...morning, hour, minute })
      }))
    });
  const pickHeadsUpTime = () =>
    sheet({
      title: t.notifHeadsUpTime,
      options: Array.from({ length: 15 }, (_, index) => 7 + index).map((hour) => ({
        label: `${prefs.headsUp.hour === hour && prefs.headsUp.minute === 0 ? "● " : "○ "}${clockAt(hour, 0)}`,
        run: () => void change({ ...prefs, headsUp: { hour, minute: 0 } })
      }))
    });

  const moneyOn = prefs.kinds.bills || prefs.kinds.installments || prefs.kinds.car;

  return (
    <Screen>
      {systemOff ? (
        <Card style={{ gap: 12 }}>
          <Text style={type.rowTitle}>{t.notifSystemOff}</Text>
          <Button variant="outline" title={t.notifOpenSettings} onPress={() => void Linking.openSettings()} />
        </Card>
      ) : null}
      <Card title={t.notifGroupDay} list>
        {toggle("prayer", t.notifPrayer, t.prayerSource, true)}
        {prefs.kinds.prayer
          ? PRAYER_NAMES.map((name) => (
              <Setting key={name} inset label={prayerName[name]}>
                <Switch accessibilityLabel={`${t.notifPrayer}, ${prayerName[name]}`} trackColor={track} thumbColor={colors.ink} value={prefs.prayers[name]} onValueChange={(on) => void change({ ...prefs, prayers: { ...prefs.prayers, [name]: on } })} />
              </Setting>
            ))
          : null}
        {toggle("reminders", t.notifReminders, t.notifRemindersDetail)}
        <Setting label={t.morningAlert} detail={t.morningAlertDetail}>
          <Switch accessibilityLabel={t.morningAlert} trackColor={track} thumbColor={colors.ink} value={morning.enabled} onValueChange={(on) => void changeMorning({ ...morning, enabled: on })} />
        </Setting>
        {morning.enabled ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.morningAlertTime}, ${clockAt(morning.hour, morning.minute)}`} onPress={pickMorningTime}>
            <Setting inset label={t.morningAlertTime}>
              <Text style={type.rowSubtitle}>{clockAt(morning.hour, morning.minute)}</Text>
              <Chevron />
            </Setting>
          </Pressable>
        ) : null}
      </Card>
      <Card title={rx.medications} list>
        {toggle("medications", rx.notifDoses, rx.notifDosesDetail, true)}
        {toggle("medStock", rx.notifStock, rx.notifStockDetail)}
      </Card>
      <Card title={t.notifGroupMoney} list>
        {toggle("bills", t.notifBills, t.notifDayBefore, true)}
        {toggle("installments", t.notifInstallments, t.notifDayBefore)}
        {toggle("car", t.notifCar, t.notifCarDetail)}
        {moneyOn ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.notifHeadsUpTime}, ${clockAt(prefs.headsUp.hour, prefs.headsUp.minute)}`} onPress={pickHeadsUpTime}>
            <Setting label={t.notifHeadsUpTime} detail={t.notifHeadsUpDetail}>
              <Text style={type.rowSubtitle}>{clockAt(prefs.headsUp.hour, prefs.headsUp.minute)}</Text>
              <Chevron />
            </Setting>
          </Pressable>
        ) : null}
        {toggle("budget", t.notifBudget, t.notifBudgetDetail)}
      </Card>
      <Card title={t.notifGroupWorkout} list>
        {toggle("rest", t.notifRest, t.notifRestDetail, true)}
      </Card>
    </Screen>
  );
}
