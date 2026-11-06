import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { GroupHeader, HeaderButton, Screen, TabHeader } from "@/components/screen";
import { groups, pinnable, useSectionCounts } from "@/components/sections";
import { colors, fonts, radius } from "@/components/theme";
import { digits, t, toggleLanguage } from "@/lib/i18n";

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
      <View style={styles.group}>
        <GroupHeader label={t.pinned} action={{ label: t.editPins, onPress: editPins }} />
        <View style={styles.pins}>
          {pins.map((key) => {
            const pin = pinnable.find((item) => item.key === key);
            if (!pin) return null;
            return (
              <Link key={key} href={pin.href} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={counts[key] ? `${pin.label}, ${digits(counts[key])}` : pin.label} style={styles.pin}>
                  <IconTile name={pin.icon} size={36} tone="accent" />
                  <Text style={styles.pinLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {pin.label}
                  </Text>
                  {counts[key] ? (
                    <View style={styles.pinCount}>
                      <Text style={[type.badge, { color: colors.accentInk }]}>{digits(counts[key])}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
      {groups.map(([label, items]) => (
        <View key={label} style={styles.group}>
          <GroupHeader label={label} />
          <Card list>
            {items.map((item, index) => (
              <ListRow key={item.key} first={index === 0} href={item.href} leading={<IconTile name={item.icon} />} title={item.label} meta={counts[item.key] ? String(counts[item.key]) : undefined} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  pins: { flexDirection: "row", gap: 8 },
  // Same surface and edge as the cards below, so the grid reads as part of the page.
  pin: { flex: 1, minWidth: 0, minHeight: 88, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 6, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, borderCurve: "continuous" },
  pinLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.ink, textAlign: "center" },
  pinCount: { position: "absolute", top: 6, end: 6, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }
});
