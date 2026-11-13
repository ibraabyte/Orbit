import { router, usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Card, IconTile, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { colors } from "@/components/theme";
import { useSections } from "@/hooks/use-sections";
import { parentOf, sectionOfPath, st } from "@/lib/app-sections";
import { t } from "@/lib/i18n";

// Covers a screen whose section is switched off (reached by an old link, the widget or an alert from before), so it is
// never shown by accident. One tap switches the section back on; its data is all still there.
export function SectionOffCover() {
  const path = usePathname();
  const { hidden, saved, setOn } = useSections();
  const section = sectionOfPath(path);
  if (!section || !hidden.has(section)) return null;
  // Off because Health is off: switching Health on is what brings it back.
  const key = saved.includes(section) ? section : (parentOf(section) ?? section);

  return (
    <View style={styles.cover}>
      <Card style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
        <IconTile name="eye-off" size={44} />
        <Text style={[type.title, { textAlign: "center" }]}>{st.offTitle}</Text>
        <Text style={[type.rowSubtitle, { textAlign: "center" }]}>{`${st.names[key]} · ${st.offBody}`}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button variant="outline" title={t.back} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          <Button variant="primary" title={st.turnOn} onPress={() => void setOn(key, true)} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: "absolute", top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.shell, justifyContent: "center", padding: 16 }
});
