import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Icon, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, ErrorState, Input, Loading, Screen } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { isArabic } from "@/lib/i18n";
import { addTag, categoryLabel, mapsLink, megabytes, picturesOf, siteLabel, st, videoOf } from "@/lib/saver";
import type { SavedItem } from "@/lib/types";

// One saved item: the copy of its video or pictures kept on the server, what the AI saw in it, its tags and note.
export default function SavedPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sheet, toast } = useOverlays();
  const [item, setItem] = useState<SavedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Making a task or adding to the shopping list: one at a time, so a double tap doesn't add twice.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItem(await getApi().get<SavedItem>(`/captures/saved/${id}`));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // While the server is still looking at it, check again every few seconds.
  const pending = item?.analysis_status === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  const change = async (changes: Partial<Pick<SavedItem, "labels" | "note" | "status">>) => {
    if (!item) return;
    try {
      const next = await getApi().patch<SavedItem>(`/captures/${item.id}`, changes);
      setItem({ ...item, ...next, media: item.media });
    } catch (changeError) {
      toast(changeError instanceof Error ? changeError.message : String(changeError));
    }
  };

  const analyze = async () => {
    if (!item) return;
    try {
      setItem(await getApi().post<SavedItem>(`/captures/${item.id}/analyze`, { locale: isArabic ? "ar" : "en" }));
    } catch (analyzeError) {
      toast(analyzeError instanceof Error ? analyzeError.message : String(analyzeError));
    }
  };

  const remove = () =>
    sheet({
      title: st.removeTitle,
      detail: st.removeBody,
      options: [
        {
          label: st.remove,
          destructive: true,
          run: () => {
            void getApi()
              .delete(`/captures/${id}`)
              .then(() => router.back())
              .catch((removeError) => toast(removeError instanceof Error ? removeError.message : String(removeError)));
          }
        }
      ]
    });

  // From saved to done: the item goes to the tasks or shopping list routers like anything typed there.
  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      toast(await work());
    } catch (actError) {
      toast(actError instanceof Error ? actError.message : String(actError));
    } finally {
      setBusy(false);
    }
  };

  const makeTask = (from: SavedItem) =>
    act(async () => {
      const notes = [from.url, from.summary].filter(Boolean).join("\n");
      await getApi().post("/tasks", { title: from.title.slice(0, 220), ...(notes ? { notes } : {}) });
      return st.madeTask;
    });

  const addGroceries = (from: SavedItem) =>
    act(async () => {
      for (const name of from.ingredients) await getApi().post("/grocery-items", { name: name.slice(0, 220) });
      return st.addedGroceries(from.ingredients.length);
    });

  const submitTag = () => {
    if (!item) return;
    const next = addTag(item.labels, tag);
    setTag("");
    if (next !== item.labels) void change({ labels: next });
  };

  if (!item) {
    return <Screen title={st.details}>{error ? <ErrorState detail={error} onRetry={() => void load()} /> : <Loading />}</Screen>;
  }

  const video = videoOf(item);
  const pictures = picturesOf(item);
  const kept = item.media.reduce((total, media) => total + (media.size_bytes ?? 0), 0);
  const meta = [siteLabel(item), st.kinds[item.type] ?? null, categoryLabel(item.category)].filter(Boolean).join(" · ");

  return (
    <Screen title={st.details} refreshing={false} onRefresh={() => void load()}>
      {video ? <SavedVideo uri={getApi().absolute(video.url)} /> : null}
      {pictures.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {pictures.map((picture) => (
            <Image key={picture.id} source={{ uri: getApi().absolute(picture.url) }} style={[styles.picture, pictures.length === 1 && styles.pictureOnly]} resizeMode="cover" accessibilityIgnoresInvertColors />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: 4 }}>
        <Text style={type.title}>{item.title}</Text>
        <Text style={type.rowSubtitle}>{meta}</Text>
        {item.author ? <Text style={type.rowSubtitle}>{st.by(item.author)}</Text> : null}
      </View>

      <AnalysisState item={item} onRetry={() => void analyze()} />

      {item.summary ? <Text style={[type.body, { color: colors.ink }]}>{item.summary}</Text> : null}

      {item.analysis ? (
        <Card title={st.whatsInIt}>
          <Text style={[type.body, { color: colors.ink }]}>{item.analysis}</Text>
        </Card>
      ) : null}

      {item.content_text && item.content_text !== item.title ? (
        <Card title={st.postText}>
          <Text style={[type.body, { color: colors.ink }]} selectable>
            {item.content_text}
          </Text>
        </Card>
      ) : null}

      {item.transcript ? (
        <Card title={st.spoken}>
          <Text style={[type.body, { color: colors.ink }]} selectable>
            {item.transcript}
          </Text>
        </Card>
      ) : null}

      {item.ingredients.length ? (
        <Card title={st.ingredients}>
          {item.ingredients.map((line) => (
            <Text key={line} style={[type.body, { color: colors.ink }]} selectable>
              {`• ${line}`}
            </Text>
          ))}
          <Button title={st.addToGroceries} variant="outline" onPress={() => void addGroceries(item)} disabled={busy} />
        </Card>
      ) : null}

      <Card title={st.tags}>
        <View style={styles.tags}>
          {item.labels.length ? (
            item.labels.map((label) => (
              <Pressable
                key={label}
                onPress={() => void change({ labels: item.labels.filter((existing) => existing !== label) })}
                accessibilityRole="button"
                accessibilityLabel={`${st.remove} ${label}`}
                style={({ pressed }) => [styles.tag, pressed && { opacity: 0.7 }]}
              >
                <Text style={[type.pill, { color: colors.ink }]}>{label}</Text>
                <Icon name="x" size={12} color={colors.inkFaint} />
              </Pressable>
            ))
          ) : (
            <Text style={type.hint}>{st.noTags}</Text>
          )}
        </View>
        <View style={styles.inputRow}>
          <Input value={tag} onChangeText={setTag} placeholder={st.addTag} maxLength={40} returnKeyType="done" onSubmitEditing={submitTag} style={{ flex: 1 }} />
          <Button title={st.save} onPress={submitTag} disabled={!tag.trim()} />
        </View>
      </Card>

      <Card title={st.yourNote}>
        {note === null ? (
          <Pressable onPress={() => setNote(item.note ?? "")} accessibilityRole="button">
            <Text style={item.note ? [type.body, { color: colors.ink }] : type.hint}>{item.note || st.notePlaceholder}</Text>
          </Pressable>
        ) : (
          <View style={styles.inputRow}>
            <Input value={note} onChangeText={setNote} placeholder={st.notePlaceholder} multiline autoFocus style={{ flex: 1 }} />
            <Button
              title={st.save}
              onPress={() => {
                void change({ note: note.trim() || null });
                setNote(null);
              }}
            />
          </View>
        )}
      </Card>

      <Text style={type.hint}>{item.media.length ? `${st.copyKept}${megabytes(kept) ? ` · ${st.sizeMb(megabytes(kept)!)}` : ""}` : item.media_error ? `${st.noCopy}: ${item.media_error}` : st.noCopy}</Text>

      <View style={{ gap: 8 }}>
        {item.url ? <RowButton label={st.openOriginal} onPress={() => void Linking.openURL(item.url!)} /> : null}
        {item.place ? <RowButton label={`${st.openMap} · ${item.place}`} outline onPress={() => void Linking.openURL(mapsLink(item.place!, Platform.OS))} /> : null}
        <RowButton label={st.makeTask} outline onPress={() => void makeTask(item)} disabled={busy} />
        <RowButton label={item.status === "want" ? st.markDone : st.markWant} outline onPress={() => void change({ status: item.status === "want" ? "done" : "want" })} />
        <RowButton label={st.analyzeAgain} outline onPress={() => void analyze()} disabled={pending} />
        <RowButton label={st.remove} outline onPress={remove} />
      </View>
    </Screen>
  );
}

function SavedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (created) => {
    created.loop = false;
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" allowsPictureInPicture accessibilityLabel={st.playVideo} />;
}

function AnalysisState({ item, onRetry }: { item: Pick<SavedItem, "analysis_status" | "analysis_error">; onRetry: () => void }) {
  if (item.analysis_status === "pending") return <Text style={type.hint}>{st.analyzing}</Text>;
  if (item.analysis_status === "no_ai") return <Text style={type.hint}>{st.noAi}</Text>;
  if (item.analysis_status !== "failed") return null;
  return (
    <View style={styles.inputRow}>
      <Text style={[type.hint, { flex: 1 }]}>{item.analysis_error || st.analyzeFailed}</Text>
      <Button title={st.tryAgain} variant="outline" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 9 / 12, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  picture: { width: 220, height: 260, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pictureOnly: { width: 358, height: 300 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceInset },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 }
});
