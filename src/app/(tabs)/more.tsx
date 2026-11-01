import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Icon, IconTile, ListRow, type, type IconName } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { HeaderButton, Screen, ShellLabel, TabHeader } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useServerStatus } from "@/hooks/use-server-status";
import { openTasks } from "@/lib/dashboard";
import { financeSummary } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { t, toggleLanguage } from "@/lib/i18n";
import { peopleSummary } from "@/lib/people";

type Section = { key: string; href: Href; label: string; icon: IconName };

const section = (key: string, label: string, icon: IconName): Section => ({ key, href: `/${key}` as Href, label, icon });
const manage = [section("tasks", t.tasks, "check-square")];
const logs = [section("health", t.health, "activity"), section("whoop", t.whoop, "watch"), section("food", t.food, "coffee"), section("finance", t.finance, "credit-card"), section("people", t.people, "users"), section("habits", t.habits, "repeat"), section("goals", t.goals, "flag"), section("journal", t.journal, "book-open"), section("library", t.library, "bookmark")];
const home = [section("vehicles", t.car, "truck"), section("media", t.movies, "film"), section("servers", t.servers, "server")];
const system = [section("integrations", t.integrations, "link"), section("settings", t.settings, "settings")];
const groups: [string, Section[]][] = [[t.manageDay, manage], [t.lifeLogs, logs], [t.homeServices, home], [t.system, system]];
const pinnable = [...manage, ...logs, ...home];

const pinsKey = "orbit.more.pins";
const defaultPins = ["tasks", "health", "finance", "vehicles"];
const MAX_PINS = 4;

export default function More() {
  const { data } = useDashboardData();
  const { checks } = useServerStatus();
  const { sheet, toast } = useOverlays();
  const [pins, setPins] = useState(defaultPins);

  useEffect(() => {
    AsyncStorage.getItem(pinsKey)
      .then((saved) => saved && setPins(JSON.parse(saved)))
      .catch(() => undefined);
  }, []);

  // Live counts: a number on a section means something there is waiting for you.
  const finance = financeSummary(data);
  const counts: Record<string, number> = {
    tasks: openTasks(data.tasks).length,
    food: foodSummary(data).neededGroceries.length,
    finance: finance.overdueBills.length,
    people: peopleSummary(data).dueFollowUps.length,
    servers: checks.filter((check) => !check.up).length
  };

  const editPins = () =>
    sheet({
      title: t.editPins,
      detail: t.pinsMax,
      options: pinnable.map(({ key, label }) => ({
        label: `${pins.includes(key) ? "●" : "○"} ${label}`,
        run: () => {
          // Picking a fifth drops the oldest pin.
          const next = pins.includes(key) ? pins.filter((pin) => pin !== key) : [...pins, key].slice(-MAX_PINS);
          setPins(next);
          void AsyncStorage.setItem(pinsKey, JSON.stringify(next)).catch(() => undefined);
        }
      }))
    });

  const switchLanguage = () => {
    const message = toggleLanguage();
    if (message) toast(message);
  };

  return (
    <Screen header={<TabHeader title={t.more} action={<HeaderButton label={t.langLabel} onPress={switchLanguage} />} />}>
      <View style={{ gap: 8 }}>
        <View style={styles.pinHead}>
          <ShellLabel>{t.pinned}</ShellLabel>
          <Pressable onPress={editPins} accessibilityRole="button" hitSlop={8}>
            <Text style={[type.link, { color: colors.accent }]}>{t.editPins}</Text>
          </Pressable>
        </View>
        <View style={styles.pins}>
          {pins.map((key) => {
            const pin = pinnable.find((item) => item.key === key);
            if (!pin) return null;
            return (
              <Link key={key} href={pin.href} asChild>
                <Pressable accessibilityRole="link" style={styles.pin}>
                  <Icon name={pin.icon} size={20} color={colors.ink} />
                  <Text style={[type.pill, { color: colors.ink }]} numberOfLines={1}>
                    {pin.label}
                  </Text>
                  {counts[key] ? (
                    <View style={styles.pinCount}>
                      <Text style={[type.badge, { color: colors.accentInk }]}>{counts[key]}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
      {groups.map(([label, items]) => (
        <View key={label} style={{ gap: 8 }}>
          <ShellLabel>{label}</ShellLabel>
          <Card style={{ paddingVertical: 0, gap: 0, overflow: "hidden" }}>
            {items.map((item, index) => (
              <View key={item.key} style={index === 0 ? styles.firstRow : undefined}>
                <ListRow href={item.href} leading={<IconTile name={item.icon} />} title={item.label} meta={counts[item.key] ? String(counts[item.key]) : undefined} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pinHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pins: { flexDirection: "row", gap: 8 },
  pin: { flex: 1, minHeight: 76, backgroundColor: colors.surfaceInset, borderRadius: radius.card, paddingHorizontal: 8, paddingVertical: 10, justifyContent: "space-between" },
  pinCount: { position: "absolute", top: 8, end: 8, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  // The first row has no divider above it.
  firstRow: { marginTop: -1 }
});
