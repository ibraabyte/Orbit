import { useState } from "react";
import { Alert, Button, StyleSheet, TextInput } from "react-native";
import { Empty, Row, Screen, Section } from "@/components/screen";
import { useServerStatus } from "@/hooks/use-server-status";

export default function Servers() {
  const { servers, checks, checking, checkAll, add, remove } = useServerStatus();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  return (
    <Screen refreshing={checking} onRefresh={checkAll}>
      {servers.length ? (
        <Section title="Status">
          {servers.map((server) => {
            const check = checks.find((item) => item.id === server.id);
            return (
              <Row
                key={server.id}
                title={server.name}
                detail={check ? `${check.detail}${check.ms === null ? "" : ` · ${check.ms} ms`}` : "Checking…"}
                tone={!check ? "neutral" : check.up ? "success" : "danger"}
                right={!check ? undefined : check.up ? "Up" : "Down"}
                onPress={() =>
                  Alert.alert(server.name, server.url, [
                    { text: "Remove", style: "destructive", onPress: () => void remove(server.id) },
                    { text: "OK", style: "cancel" }
                  ])
                }
              />
            );
          })}
        </Section>
      ) : (
        <Empty>Add Seerr, Plex or any server. Orbit checks it while the app is open and alerts you if it goes down.</Empty>
      )}
      <Section title="Add a server">
        <TextInput style={styles.input} placeholder="Name (e.g. Plex)" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="https://plex.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button
          title="Add"
          disabled={!url.trim()}
          onPress={async () => {
            await add(name, url);
            setName("");
            setUrl("");
          }}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 17 }
});
