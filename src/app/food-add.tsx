import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, ListRow, type } from "@/components/drift";
import { FoodLogPanel } from "@/components/food-log-panel";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen, SearchBar, Segments, ui } from "@/components/screen";
import { getApi } from "@/lib/backend";
import {
  emptyFoodForm,
  foodApi,
  foodFormInput,
  formatNumber,
  logCandidate,
  savedToCandidate,
  servingText,
  sourceLabel,
  type FoodCandidate,
  type FoodForm,
  type MealType
} from "@/lib/food-log";
import { t } from "@/lib/i18n";

type Mode = "search" | "new";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function FoodAdd() {
  const params = useLocalSearchParams<{ mode?: string; barcode?: string }>();
  const { toast } = useOverlays();
  const [mode, setMode] = useState<Mode>(params.mode === "new" ? "new" : "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodCandidate[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [recent, setRecent] = useState<FoodCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<FoodCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FoodForm>({ ...emptyFoodForm, barcode: params.barcode ?? "" });
  const latest = useRef("");

  useEffect(() => {
    foodApi
      .recent(getApi())
      .then((rows) => setRecent(rows.map(savedToCandidate)))
      .catch(() => undefined);
  }, []);

  // Search after a short pause in typing; only the newest answer is shown.
  useEffect(() => {
    const text = query.trim();
    latest.current = text;
    if (text.length < 2) {
      setResults([]);
      setNotes([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      foodApi
        .search(getApi(), text)
        .then((found) => {
          if (latest.current !== text) return;
          setResults(found.results);
          setNotes(found.notes);
          setError(null);
        })
        .catch((reason: unknown) => latest.current === text && setError(message(reason)))
        .finally(() => latest.current === text && setSearching(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  async function log(candidate: FoodCandidate, servings: number, mealType: MealType) {
    setBusy(true);
    try {
      await logCandidate(getApi(), candidate, servings, mealType);
      toast(t.logged);
      router.back();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveOwn() {
    const checked = foodFormInput(form);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    try {
      const saved = await foodApi.create(getApi(), checked.input);
      setError(null);
      setPicked(savedToCandidate(saved));
      setMode("search");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof FoodForm, placeholder: string, numeric = false) => (
    <Input
      value={form[key] ?? ""}
      onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
      placeholder={placeholder}
      keyboardType={numeric ? "decimal-pad" : "default"}
      accessibilityLabel={placeholder}
    />
  );

  const row = (candidate: FoodCandidate, index: number) => (
    <ListRow
      key={`${candidate.source}-${candidate.source_id ?? candidate.food_id ?? index}`}
      first={index === 0}
      title={candidate.name}
      badges={<Badge tone={candidate.food_id ? "accent" : "neutral"}>{candidate.food_id ? t.mine : sourceLabel(candidate.source)}</Badge>}
      subtitle={[candidate.brand, servingText(candidate)].filter(Boolean).join(" · ")}
      meta={`${formatNumber(candidate.calories)} ${t.kcal}`}
      onPress={() => setPicked(candidate)}
      chevron
    />
  );

  const showing = query.trim().length >= 2 ? results : recent;

  return (
    <Screen>
      <Segments options={["search", "new"] as const} value={mode} onChange={setMode} labels={{ search: t.addFood, new: t.newFood }} />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {picked ? <FoodLogPanel key={`${picked.source}-${picked.source_id ?? picked.food_id}`} food={picked} busy={busy} onLog={(servings, mealType) => void log(picked, servings, mealType)} onClose={() => setPicked(null)} /> : null}

      {mode === "search" ? (
        <>
          <SearchBar value={query} onChangeText={setQuery} placeholder={t.searchFood} autoFocus={!picked} autoCorrect={false} />
          {notes.map((note) => (
            <Text key={note} style={type.shellMuted}>
              {note}
            </Text>
          ))}
          {searching ? <Loading /> : null}
          {showing.length ? (
            <Card title={query.trim().length >= 2 ? t.results : t.recent}>{showing.map(row)}</Card>
          ) : !searching && query.trim().length >= 2 ? (
            <Card>
              <EmptyState icon="search">{t.noFoodFound}</EmptyState>
              <Button title={t.newFood} variant="outline" onPress={() => {
                setForm((current) => ({ ...current, name: query.trim() }));
                setMode("new");
              }} />
            </Card>
          ) : null}
        </>
      ) : (
        <Card title={t.myFood}>
          <View style={{ gap: 10 }}>
            {field("name", t.foodName)}
            {field("serving_label", t.servingLabel)}
            {field("serving_grams", t.servingGrams, true)}
            {field("calories", t.caloriesPerServing, true)}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>{field("protein_g", t.proteinG, true)}</View>
              <View style={{ flex: 1 }}>{field("carbs_g", t.carbsG, true)}</View>
              <View style={{ flex: 1 }}>{field("fat_g", t.fatG, true)}</View>
            </View>
            <Button title={t.save} variant="primary" disabled={busy} onPress={() => void saveOwn()} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
