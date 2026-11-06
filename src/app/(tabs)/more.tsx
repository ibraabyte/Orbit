import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Icon, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { HeaderButton, Screen, ShellLabel, TabHeader } from "@/components/screen";
import { groups, pinnable, useSectionCounts } from "@/components/sections";
import { colors, fonts, radius } from "@/components/theme";
import { t, toggleLanguage } from "@/lib/i18n";

const pinsKey = "orbit.more.pins";
const defaultPins = ["tasks", "health", "finance", "vehicles"];
const MAX_PINS = 4;

export default function More() {
  const { sheet, toast } = useOverlays();
  const [pins, setPins] = useState(defaultPins);

  useEffect(() => {
    AsyncStorage.getItem(pinsKey)
      .then((saved) => saved && setPins(JSON.parse(saved)))
      .catch(() => undefined);
  }, []);

  const counts = useSectionCounts();

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
          <Pressable onPress={editPins} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.edit, pressed && { opacity: 0.7 }]}>
            <Text style={type.link}>{t.editPins}</Text>
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
                  <Text style={[type.pill, { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink }]} numberOfLines={1}>
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
  edit: { minHeight: 32, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentLine, justifyContent: "center" },
  pins: { flexDirection: "row", gap: 8 },
  pin: { flex: 1, minHeight: 76, backgroundColor: colors.surfaceInset, borderRadius: radius.card, paddingHorizontal: 8, paddingVertical: 10, justifyContent: "space-between" },
  pinCount: { position: "absolute", top: 8, end: 8, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  // The first row has no divider above it.
  firstRow: { marginTop: -1 }
});
