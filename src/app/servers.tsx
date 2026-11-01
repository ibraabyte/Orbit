import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, Icon, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useServerStatus } from "@/hooks/use-server-status";
import { t } from "@/lib/i18n";

export default function Servers() {
  const { servers, checks, checking, checkAll, add, remove } = useServerStatus();
  const { sheet } = useOverlays();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const down = servers.filter((server) => checks.find((check) => check.id === server.id && !check.up));

  return (
    <Screen stackAction={{ label: t.addServer, onPress: () => setAdding(!adding) }} refreshing={checking} onRefresh={checkAll}>
      {down.length ? (
        <View style={styles.alert} accessibilityRole="alert">
          <Text style={styles.alertText}>! {down.map((server) => server.name).join(" · ")} · {t.down}</Text>
        </View>
      ) : null}
      {adding ? (
        <Card title={t.addServer}>
          <Input placeholder={t.serverName} value={name} onChangeText={setName} />
          <Input placeholder="https://plex.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ writingDirection: "ltr" }} />
          <Button
            title={t.add}
            disabled={!url.trim()}
            onPress={async () => {
              await add(name, url);
              setName("");
              setUrl("");
              setAdding(false);
            }}
          />
        </Card>
      ) : null}
      <Card>
        {!servers.length ? <EmptyState example="https://plex.example.com">{t.emptyEx}</EmptyState> : null}
        {servers.map((server) => {
          const check = checks.find((item) => item.id === server.id);
          const up = check?.up;
          return (
            <ListRow
              key={server.id}
              leading={<View style={[styles.dot, { backgroundColor: up === undefined ? colors.hairline : up ? colors.success : colors.urgent, shadowColor: up ? colors.success : colors.urgent }]} />}
              title={server.name}
              subtitle={check ? check.detail : `${t.loading}…`}
              badges={check ? <Badge tone={up ? "success" : "urgent"} glyph={up ? "✓" : "!"}>{up ? t.up : t.down}</Badge> : undefined}
              meta={check?.ms ? `${check.ms} ms` : undefined}
              trailing={
                <Pressable
                  onPress={() => sheet({ title: server.name, detail: server.url, options: [{ label: t.delete, destructive: true, run: () => void remove(server.id) }] })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.delete}: ${server.name}`}
                  style={styles.remove}
                >
                  <Icon name="x" size={15} color={colors.inkFaint} />
                </Pressable>
              }
            />
          );
        })}
      </Card>
      <Text style={[type.shellMuted, { textAlign: "center", fontSize: 12 }]}>{t.checkedOnOpen}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { backgroundColor: colors.urgent, borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10 },
  alertText: { fontFamily: fonts.bold, fontSize: 13, color: colors.urgentInk },
  dot: { width: 10, height: 10, borderRadius: 5, shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  remove: { width: 32, height: 44, alignItems: "center", justifyContent: "center" }
});
