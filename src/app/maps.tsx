import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Chips } from "@/components/chips";
import { Badge, Card, EmptyState, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen, ui } from "@/components/screen";
import { colors, space } from "@/components/theme";
import { loadTravelPrefs, phonePosition, saveTravelPrefs } from "@/hooks/use-leave-alerts";
import { getApi, hasServer } from "@/lib/backend";
import { formatClock } from "@/lib/i18n";
import { BUFFERS, leaveLine, MAPS_KEY_URL, mapsApi, mx, TRAVEL_DEFAULT, TRAVEL_MODES, type LeaveTime, type MapsStatus, type TravelPrefs } from "@/lib/maps";

// Google Maps, with the person's own key: link it, pick how they travel and the time to spare, and see when to leave
// for the coming appointments that have a place.
export default function Maps() {
  const onServer = hasServer();
  const { sheet } = useOverlays();
  const [status, setStatus] = useState<MapsStatus | null>(null);
  const [prefs, setPrefs] = useState<TravelPrefs>(TRAVEL_DEFAULT);
  const [loading, setLoading] = useState(onServer);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [items, setItems] = useState<LeaveTime[] | null>(null);
  const [timing, setTiming] = useState(false);
  const [noLocation, setNoLocation] = useState(false);

  const time = useCallback(async (choice: TravelPrefs) => {
    setTiming(true);
    try {
      const origin = await phonePosition(true);
      setNoLocation(!origin);
      if (!origin) return setItems(null);
      setItems((await mapsApi.leave(getApi(), origin, choice)).items);
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTiming(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!onServer) return;
    setLoading(true);
    try {
      const [found, saved] = await Promise.all([mapsApi.status(getApi()), loadTravelPrefs()]);
      setStatus(found);
      setPrefs(saved);
      if (found.connected) void time(saved);
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [onServer, time]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const change = async (next: TravelPrefs) => {
    setPrefs(next);
    await saveTravelPrefs(next).catch(() => undefined);
    if (status?.connected) void time(next);
  };

  const connect = async () => {
    setBusy(true);
    try {
      setStatus(await mapsApi.connect(getApi(), key));
      setKey("");
      setNotice({ ok: true, message: mx.connected });
      void time(prefs);
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    sheet({
      title: mx.unlinkTitle,
      detail: mx.unlinkDetail,
      options: [
        {
          label: mx.disconnect,
          destructive: true,
          run: () =>
            void (async () => {
              setBusy(true);
              try {
                await mapsApi.disconnect(getApi());
                setStatus({ connected: false, connected_at: null });
                setItems(null);
                setNotice({ ok: true, message: mx.unlinked });
              } catch (error) {
                setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
              } finally {
                setBusy(false);
              }
            })()
        }
      ]
    });

  if (loading && !status) return <Loading />;
  const connected = Boolean(status?.connected);

  return (
    <Screen refreshing={loading} onRefresh={() => void load()}>
      <Card title={mx.maps} action={connected ? <Badge tone="success">{mx.linked}</Badge> : null}>
        {notice ? <Text style={notice.ok ? { color: colors.success } : ui.error}>{notice.message}</Text> : null}
        {connected ? (
          <>
            <ListRow first leading={<IconTile name="navigation" />} title={mx.maps} subtitle={mx.connected} />
            <Button variant="outline" title={mx.disconnect} disabled={busy} onPress={disconnect} />
          </>
        ) : (
          <>
            <Text style={type.rowSubtitle}>{mx.intro}</Text>
            <Text style={type.rowSubtitle}>{mx.steps}</Text>
            <Input accessibilityLabel={mx.keyPh} placeholder={mx.keyPh} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
            <Button title={busy ? mx.connecting : mx.connect} disabled={busy || key.trim().length < 20} onPress={() => void connect()} />
            <Button variant="outline" title={mx.openConsole} onPress={() => void WebBrowser.openBrowserAsync(MAPS_KEY_URL)} />
          </>
        )}
        <Text style={type.hint}>{mx.privacy}</Text>
      </Card>

      <Card title={mx.travel}>
        <Chips options={TRAVEL_MODES} value={prefs.mode} onChange={(mode) => void change({ ...prefs, mode })} label={(mode) => mx.modes[mode]} />
        <Text style={type.sectionLabel}>{mx.buffer}</Text>
        <Chips options={BUFFERS.map(String)} value={String(prefs.buffer)} onChange={(value) => void change({ ...prefs, buffer: Number(value) })} label={(value) => mx.bufferNames(Number(value))} />
      </Card>

      {connected ? (
        <Card title={mx.coming}>
          {noLocation ? <Text style={type.rowSubtitle}>{mx.needsLocation}</Text> : null}
          {items && !items.length ? <EmptyState icon="map-pin">{mx.nothing}</EmptyState> : null}
          {(items ?? []).map((item, index) => (
            <ListRow
              key={item.task_id}
              first={index === 0}
              leading={<IconTile name={item.status === "late" ? "alert-triangle" : "navigation"} tone={item.status === "late" ? "urgent" : "neutral"} />}
              title={item.title}
              subtitle={`${leaveLine(item)}\n${item.place_name}`}
              meta={formatClock(item.due_at)}
              onPress={() => router.push(`/task/${item.task_id}`)}
              chevron
            />
          ))}
          <View style={{ paddingTop: space.sm }}>
            <Button variant="outline" title={timing ? mx.checking : mx.check} disabled={timing} onPress={() => void time(prefs)} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
