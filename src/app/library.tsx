import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, Icon, type } from "@/components/drift";
import { Chip } from "@/components/exercise-ui";
import { useOverlays, type SheetOption } from "@/components/overlays";
import { BleedRow, Button, ErrorState, Input, Loading, Screen, SearchBar, Segments } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { ApiError } from "@/lib/api";
import { getApi } from "@/lib/backend";
import { digits, isArabic } from "@/lib/i18n";
import {
  categoryCounts,
  categoryLabel,
  categoryList,
  filterSaved,
  findLink,
  inOrder,
  isWorking,
  posterOf,
  replaced,
  sharedFiles,
  sharedLink,
  sharedText,
  siteLabel,
  st,
  STATUS_FILTERS,
  videoOf,
  withSaved,
  type SaveResult,
  type SharedFile,
  type SmartSearch,
  type StatusFilter
} from "@/lib/saver";
import type { SavedItem } from "@/lib/types";

const OWN_CATEGORIES = "orbit.saver.categories";

// The saver: everything you share from TikTok, X, Photos or any app (or paste here). The server keeps a copy of the video,
// pictures and tweet text, and the user's own AI writes a summary, tags and search words (backend/app/routers/saver.py).
// Items are sorted into categories and marked "to see" or "seen"; tapping one opens its page (saved/[id].tsx).
const locale = isArabic ? "ar" : "en";
export default function Saver() {
  const { sheet, toast } = useOverlays();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("want");
  const [query, setQuery] = useState("");
  const [ownCategories, setOwnCategories] = useState<string[]>([]);
  // A new category's name being typed: for the filter row (null id) or to move one link into it.
  const [naming, setNaming] = useState<{ forId: string | null; name: string } | null>(null);
  // The last search by meaning, shown while the search box still says the same.
  const [smart, setSmart] = useState<(SmartSearch & { query: string }) | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getApi().get<SavedItem[]>("/captures/saved?limit=500"));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // While the server is still looking at something, refresh every few seconds so its tags and summary appear.
  const working = isWorking(items ?? []);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      getApi()
        .get<SavedItem[]>("/captures/saved?limit=500")
        .then(setItems)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [working]);

  useEffect(() => {
    AsyncStorage.getItem(OWN_CATEGORIES)
      .then((saved) => setOwnCategories(saved ? (JSON.parse(saved) as string[]) : []))
      .catch(() => undefined);
  }, []);

  const rememberCategory = useCallback((name: string) => {
    setOwnCategories((current) => {
      if (current.includes(name)) return current;
      const next = [...current, name];
      void AsyncStorage.setItem(OWN_CATEGORIES, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const analyze = useCallback(
    async (id: string) => {
      try {
        const next = await getApi().post<SavedItem>(`/captures/${id}/analyze`, { locale });
        setItems((current) => (current ? replaced(current, next) : current));
      } catch (analyzeError) {
        toast(analyzeError instanceof Error ? analyzeError.message : String(analyzeError));
      }
    },
    [toast]
  );

  const save = useCallback(
    async (url: string, title?: string | null) => {
      setSaving(true);
      try {
        const body: Record<string, string> = { url, locale };
        if (title) body.title = title;
        if (category) body.category = category;
        const result = await getApi().post<SaveResult>("/captures/save", body);
        setItems((current) => withSaved(current ?? [], result.capture));
        setLink("");
        toast(result.existed ? st.alreadySaved : st.saved);
      } catch (saveError) {
        toast(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setSaving(false);
      }
    },
    [category, toast]
  );

  // Pictures and videos shared from Photos or any app: each is uploaded and kept on the server.
  const upload = useCallback(
    async (files: SharedFile[]) => {
      setSaving(true);
      toast(st.savingFile);
      try {
        for (const file of files) {
          const form = new FormData();
          // React Native's fetch reads the file from this { uri, name, type } itself.
          form.append("file", file as unknown as Blob);
          form.append("locale", locale);
          if (category) form.append("category", category);
          const item = await getApi().upload<SavedItem>("/captures/upload", form);
          setItems((current) => withSaved(current ?? [], item));
        }
        toast(st.savedFile);
      } catch (uploadError) {
        toast(uploadError instanceof Error ? uploadError.message : String(uploadError));
      } finally {
        setSaving(false);
      }
    },
    [category, toast]
  );

  const saveText = useCallback(
    async (text: string) => {
      try {
        const body: Record<string, string> = { text, locale };
        if (category) body.category = category;
        const item = await getApi().post<SavedItem>("/captures/text", body);
        setItems((current) => withSaved(current ?? [], item));
        toast(st.saved);
      } catch (textError) {
        toast(textError instanceof Error ? textError.message : String(textError));
      }
    },
    [category, toast]
  );

  // Something shared into Orbit from another app lands here: pictures and videos, a link, or plain text.
  useEffect(() => {
    if (!hasShareIntent) return;
    const files = sharedFiles(shareIntent);
    const shared = sharedLink(shareIntent);
    const text = sharedText(shareIntent);
    resetShareIntent();
    if (files.length) void upload(files);
    else if (shared) void save(shared.url, shared.title);
    else if (text) void saveText(text);
  }, [hasShareIntent, shareIntent, resetShareIntent, save, upload, saveText]);

  const searchByMeaning = async () => {
    const asked = query.trim();
    if (!asked) return;
    setSearching(true);
    try {
      const found = await getApi().post<SmartSearch>("/captures/search", { query: asked });
      setSmart({ ...found, query: asked });
    } catch (searchError) {
      toast(searchError instanceof ApiError && searchError.status === 409 ? st.noAi : searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setSearching(false);
    }
  };

  const saveTyped = () => {
    const url = findLink(link.trim()) ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link.trim()) ? `https://${link.trim()}` : null);
    if (!url) {
      toast(st.notALink);
      return;
    }
    void save(url);
  };

  const update = async (id: string, changes: Partial<Pick<SavedItem, "status" | "category">>) => {
    try {
      const next = await getApi().patch<SavedItem>(`/captures/${id}`, changes);
      setItems((current) => (current ? replaced(current, { ...next, media: current.find((item) => item.id === id)?.media ?? [] }) : current));
    } catch (updateError) {
      toast(updateError instanceof Error ? updateError.message : String(updateError));
    }
  };

  const remove = (item: SavedItem) =>
    sheet({
      title: st.removeTitle,
      detail: st.removeBody,
      options: [
        {
          label: st.remove,
          destructive: true,
          run: () => {
            void getApi()
              .delete(`/captures/${item.id}`)
              .then(() => setItems((current) => current?.filter((row) => row.id !== item.id) ?? null))
              .catch((removeError) => toast(removeError instanceof Error ? removeError.message : String(removeError)));
          }
        }
      ]
    });

  const all = useMemo(() => items ?? [], [items]);
  const categories = categoryList(all, ownCategories);
  const counts = categoryCounts(all, status);
  const smartShown = smart && smart.query === query.trim() ? inOrder(all, smart.ids) : null;
  const shown = smartShown ?? filterSaved(all, { category, status, query });

  const moveTo = (item: SavedItem) =>
    sheet({
      title: st.moveTo,
      options: [
        ...categories.filter((name) => name !== item.category).map<SheetOption>((name) => ({ label: categoryLabel(name), run: () => void update(item.id, { category: name }) })),
        { label: `＋ ${st.newCategory}`, run: () => setNaming({ forId: item.id, name: "" }) }
      ]
    });

  const actions = (item: SavedItem) =>
    sheet({
      title: item.title,
      detail: siteLabel(item) ?? undefined,
      options: [
        ...(item.url ? [{ label: st.open, run: () => void Linking.openURL(item.url!) }] : []),
        { label: item.status === "want" ? st.markDone : st.markWant, run: () => void update(item.id, { status: item.status === "want" ? "done" : "want" }) },
        { label: st.moveTo, run: () => moveTo(item) },
        { label: st.details, run: () => router.push(`/saved/${item.id}`) },
        { label: st.analyzeAgain, run: () => void analyze(item.id) },
        ...(item.category === "movie" ? [{ label: st.findInSeerr, run: () => router.push({ pathname: "/media", params: { q: item.title } }) }] : []),
        { label: st.remove, destructive: true, run: () => remove(item) }
      ]
    });

  const finishNaming = () => {
    const name = naming?.name.trim().slice(0, 40);
    if (!naming || !name) {
      setNaming(null);
      return;
    }
    rememberCategory(name);
    if (naming.forId) void update(naming.forId, { category: name });
    else setCategory(name);
    setNaming(null);
  };

  return (
    <Screen refreshing={loading && items !== null} onRefresh={load}>
      <View style={styles.saveRow}>
        <Input
          value={link}
          onChangeText={setLink}
          placeholder={st.pasteLink}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={saveTyped}
          style={{ flex: 1 }}
        />
        <Button title={saving ? st.saving : st.save} onPress={saveTyped} disabled={saving || !link.trim()} />
      </View>

      <BleedRow>
        <Chip label={st.all} on={category === null} onPress={() => setCategory(null)} />
        {categories.map((name) => {
          const count = counts.get(name);
          return <Chip key={name} label={count ? `${categoryLabel(name)} ${digits(count)}` : categoryLabel(name)} on={category === name} onPress={() => setCategory(category === name ? null : name)} />;
        })}
        <Chip label={st.newCategory} icon="plus" on={false} onPress={() => setNaming({ forId: null, name: "" })} />
      </BleedRow>

      {naming ? (
        <View style={styles.saveRow}>
          <Input value={naming.name} onChangeText={(name) => setNaming({ ...naming, name })} placeholder={st.newCategoryBody} maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={finishNaming} style={{ flex: 1 }} />
          <Button title={st.save} onPress={finishNaming} disabled={!naming.name.trim()} />
        </View>
      ) : null}

      <Segments options={STATUS_FILTERS} value={status} onChange={setStatus} labels={st.statuses} small />
      <SearchBar placeholder={st.search} value={query} onChangeText={setQuery} />
      {query.trim() ? (
        <Pressable onPress={() => (smartShown ? setSmart(null) : void searchByMeaning())} disabled={searching} accessibilityRole="button" style={({ pressed }) => [styles.smart, pressed && { opacity: 0.8 }]}>
          <Icon name={smartShown ? "x" : "zap"} size={14} color={colors.accent} />
          <Text style={[type.pill, { color: colors.accent, flex: 1 }]} numberOfLines={1}>
            {searching ? st.smartSearching : smartShown ? `${st.smartResults(smartShown.length)} · ${st.clearSmart}` : st.smartSearch(query.trim())}
          </Text>
        </Pressable>
      ) : null}
      {smartShown && smart?.terms.length ? (
        <Text style={type.hint} numberOfLines={2}>
          {`${st.searchedFor}: ${smart.terms.slice(1, 9).join("، ")}`}
        </Text>
      ) : null}

      {error && !items ? <ErrorState detail={error} onRetry={() => void load()} /> : null}
      {!items && !error ? <Loading /> : null}
      {items ? (
        <Card>
          {!shown.length ? <EmptyState icon="bookmark">{smartShown ? st.smartNone : all.length ? st.emptyFilter : st.empty}</EmptyState> : null}
          {shown.map((item) => (
            <SavedRow key={item.id} item={item} onPress={() => router.push(`/saved/${item.id}`)} onMore={() => actions(item)} onToggle={() => void update(item.id, { status: item.status === "want" ? "done" : "want" })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function SavedRow({ item, onPress, onMore, onToggle }: { item: SavedItem; onPress: () => void; onMore: () => void; onToggle: () => void }) {
  const site = siteLabel(item);
  const done = item.status === "done";
  const poster = posterOf(item);
  const picture = poster ? getApi().absolute(poster.url) : item.image_url;
  const video = videoOf(item);
  const state = item.analysis_status === "pending" ? st.analyzing : item.analysis_status === "failed" ? st.analyzeFailed : null;
  return (
    <Pressable onPress={onPress} onLongPress={onMore} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View>
        {picture ? (
          <Image source={{ uri: picture }} style={styles.thumb} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name={item.type === "image" ? "image" : item.type === "video" ? "film" : item.url ? "link" : "edit-3"} size={20} color={colors.inkFaint} />
          </View>
        )}
        {video ? (
          <View style={styles.play} accessibilityLabel={st.videoBadge}>
            <Icon name="play" size={11} color={colors.ink} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={[type.rowTitle, done && { color: colors.inkMuted }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={type.rowSubtitle} numberOfLines={1}>
          {[site ?? st.kinds[item.type], categoryLabel(item.category)].filter(Boolean).join(" · ")}
        </Text>
        {state ? <Text style={type.hint}>{state}</Text> : item.summary ? <Text style={[type.rowSubtitle, { color: colors.inkMuted }]} numberOfLines={3}>{item.summary}</Text> : null}
        {item.labels.length ? (
          <View style={styles.tags}>
            {item.labels.slice(0, 4).map((label) => (
              <Text key={label} style={styles.tag} numberOfLines={1}>
                {label}
              </Text>
            ))}
          </View>
        ) : null}
        {item.note ? <Text style={type.hint} numberOfLines={2}>{item.note}</Text> : null}
      </View>
      <View style={styles.side}>
        <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={done ? st.markWant : st.markDone} style={[styles.check, done && styles.checkOn]}>
          {done ? <Icon name="check" size={14} color={colors.accent} /> : null}
        </Pressable>
        <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button" accessibilityLabel={st.moveTo} style={styles.more}>
          <Icon name="more-horizontal" size={18} color={colors.inkFaint} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  thumb: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  side: { alignItems: "center", gap: 10 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.inkFaint, alignItems: "center", justifyContent: "center" },
  // Night: sand is a line here, never a fill (only the main button is filled).
  checkOn: { borderColor: colors.accent },
  more: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  play: { position: "absolute", bottom: 5, start: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(10,10,11,0.75)", alignItems: "center", justifyContent: "center" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tag: { ...type.pill, color: colors.inkMuted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" },
  smart: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.accentLine }
});
