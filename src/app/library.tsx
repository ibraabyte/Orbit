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
import { isArabic } from "@/lib/i18n";
import {
  categoryCounts,
  categoryLabel,
  categoryList,
  filterSaved,
  findLink,
  replaced,
  sharedLink,
  siteLabel,
  st,
  STATUS_FILTERS,
  withSaved,
  type SaveResult,
  type StatusFilter
} from "@/lib/saver";
import type { Capture } from "@/lib/types";

const OWN_CATEGORIES = "orbit.saver.categories";

// The saver: everything you share from TikTok, X or any app (or paste here), with its picture, site and a short summary,
// sorted into categories and marked "to see" or "seen". The server reads each link; the video itself is never kept.
export default function Saver() {
  const { sheet, toast } = useOverlays();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [items, setItems] = useState<Capture[] | null>(null);
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
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getApi().get<Capture[]>("/captures?limit=500"));
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

  const summarize = useCallback(async (id: string, quiet: boolean) => {
    setSummarizing((current) => new Set(current).add(id));
    try {
      const next = await getApi().post<Capture>(`/captures/${id}/summary`, { locale: isArabic ? "ar" : "en" });
      setItems((current) => (current ? replaced(current, next) : current));
    } catch (summaryError) {
      // Saving never waits on the AI: with none connected, the link just keeps the page's own description.
      if (!quiet) toast(summaryError instanceof ApiError && summaryError.status === 409 ? st.connectAi : summaryError instanceof Error ? summaryError.message : String(summaryError));
    } finally {
      setSummarizing((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [toast]);

  const save = useCallback(
    async (url: string, title?: string | null) => {
      setSaving(true);
      try {
        const body: Record<string, string> = { url };
        if (title) body.title = title;
        if (category) body.category = category;
        const result = await getApi().post<SaveResult>("/captures/save", body);
        setItems((current) => withSaved(current ?? [], result.capture));
        setLink("");
        toast(result.existed ? st.alreadySaved : st.saved);
        if (!result.existed) void summarize(result.capture.id, true);
      } catch (saveError) {
        toast(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setSaving(false);
      }
    },
    [category, summarize, toast]
  );

  // A link shared into Orbit from another app lands here.
  useEffect(() => {
    if (!hasShareIntent) return;
    const shared = sharedLink(shareIntent);
    resetShareIntent();
    if (shared) void save(shared.url, shared.title);
    else if (shareIntent.text) setLink(shareIntent.text);
  }, [hasShareIntent, shareIntent, resetShareIntent, save]);

  const saveTyped = () => {
    const url = findLink(link.trim()) ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link.trim()) ? `https://${link.trim()}` : null);
    if (!url) {
      toast(st.notALink);
      return;
    }
    void save(url);
  };

  const update = async (id: string, changes: Partial<Pick<Capture, "status" | "category">>) => {
    try {
      const next = await getApi().patch<Capture>(`/captures/${id}`, changes);
      setItems((current) => (current ? replaced(current, next) : current));
    } catch (updateError) {
      toast(updateError instanceof Error ? updateError.message : String(updateError));
    }
  };

  const remove = (item: Capture) =>
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
  const shown = filterSaved(all, { category, status, query });

  const moveTo = (item: Capture) =>
    sheet({
      title: st.moveTo,
      options: [
        ...categories.filter((name) => name !== item.category).map<SheetOption>((name) => ({ label: categoryLabel(name), run: () => void update(item.id, { category: name }) })),
        { label: `＋ ${st.newCategory}`, run: () => setNaming({ forId: item.id, name: "" }) }
      ]
    });

  const actions = (item: Capture) =>
    sheet({
      title: item.title,
      detail: siteLabel(item) ?? undefined,
      options: [
        ...(item.url ? [{ label: st.open, run: () => void Linking.openURL(item.url!) }] : []),
        { label: item.status === "want" ? st.markDone : st.markWant, run: () => void update(item.id, { status: item.status === "want" ? "done" : "want" }) },
        { label: st.moveTo, run: () => moveTo(item) },
        { label: st.summarize, run: () => void summarize(item.id, false) },
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
          return <Chip key={name} label={count ? `${categoryLabel(name)} ${count}` : categoryLabel(name)} on={category === name} onPress={() => setCategory(category === name ? null : name)} />;
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

      {error && !items ? <ErrorState detail={error} onRetry={() => void load()} /> : null}
      {!items && !error ? <Loading /> : null}
      {items ? (
        <Card>
          {!shown.length ? <EmptyState icon="bookmark">{all.length ? st.emptyFilter : st.empty}</EmptyState> : null}
          {shown.map((item) => (
            <SavedRow key={item.id} item={item} busy={summarizing.has(item.id)} onPress={() => (item.url ? void Linking.openURL(item.url) : actions(item))} onMore={() => actions(item)} onToggle={() => void update(item.id, { status: item.status === "want" ? "done" : "want" })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function SavedRow({ item, busy, onPress, onMore, onToggle }: { item: Capture; busy: boolean; onPress: () => void; onMore: () => void; onToggle: () => void }) {
  const site = siteLabel(item);
  const done = item.status === "done";
  return (
    <Pressable onPress={onPress} onLongPress={onMore} accessibilityRole="link" style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name={item.url ? "link" : "edit-3"} size={20} color={colors.inkFaint} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[type.rowTitle, done && { color: colors.inkMuted }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={type.rowSubtitle} numberOfLines={1}>
          {[site, categoryLabel(item.category)].filter(Boolean).join(" · ")}
        </Text>
        {busy ? <Text style={type.hint}>{st.summarizing}</Text> : item.summary ? <Text style={[type.rowSubtitle, { color: colors.inkMuted }]} numberOfLines={3}>{item.summary}</Text> : null}
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
  more: { width: 26, height: 26, alignItems: "center", justifyContent: "center" }
});
