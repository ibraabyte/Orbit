import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Badge, Card, CheckItem, EmptyState, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen, Segments, ui } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { foodApi, macroText, mealTypeAt, parseAmount, plateItemNutrition, plateTotal, type MealType, type PlateEstimate, type PlateItem } from "@/lib/food-log";
import { t } from "@/lib/i18n";

const pickerTypes = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly MealType[];
// Big enough to see the food, small enough to send quickly (and under the AI's 5 MB limit).
const MAX_SIDE = 1280;

type Draft = PlateItem & { include: boolean; caloriesText: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function shrink(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("That photo couldn't be read. Try again.");
  return { uri: saved.uri, base64: saved.base64 };
}

export default function FoodPhoto() {
  const { toast } = useOverlays();
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [note, setNote] = useState("");
  const [estimate, setEstimate] = useState<PlateEstimate | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mealType, setMealType] = useState<(typeof pickerTypes)[number]>(() => {
    const guess = mealTypeAt();
    return guess === "other" ? "snack" : guess;
  });
  const [busy, setBusy] = useState<"photo" | "estimate" | "log" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(fromCamera: boolean) {
    setError(null);
    try {
      if (fromCamera) {
        const allowed = await ImagePicker.requestCameraPermissionsAsync();
        if (!allowed.granted) {
          setError(t.cameraNeeded);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      setBusy("photo");
      setPhoto(await shrink(result.assets[0]));
      setEstimate(null);
      setDrafts([]);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  }

  async function runEstimate() {
    if (!photo) return;
    setBusy("estimate");
    setError(null);
    try {
      const found = await foodApi.photo(getApi(), photo.base64, "image/jpeg", note);
      setEstimate(found);
      setDrafts(found.items.map((item) => ({ ...item, include: true, caloriesText: String(plateItemNutrition(item).calories) })));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  }

  function edit(index: number, change: Partial<Draft>) {
    setDrafts((current) => current.map((draft, at) => (at === index ? { ...draft, ...change } : draft)));
  }

  // The calories field wins over the AI's number when the user changed it.
  const chosen = drafts
    .filter((draft) => draft.include)
    .map((draft) => {
      const typed = parseAmount(draft.caloriesText);
      return { ...draft, calories: typeof typed === "number" ? typed : draft.calories };
    });

  async function logAll() {
    setBusy("log");
    setError(null);
    try {
      const api = getApi();
      const at = new Date();
      for (const item of chosen) await foodApi.logPlateItem(api, item, mealType, at);
      toast(t.logged);
      router.back();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Card>
        {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" accessibilityLabel={t.platePhoto} /> : <EmptyState icon="camera">{t.estimateHint}</EmptyState>}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title={t.takePhoto} variant={photo ? "outline" : "primary"} disabled={Boolean(busy)} onPress={() => void pick(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t.choosePhoto} variant="outline" disabled={Boolean(busy)} onPress={() => void pick(false)} />
          </View>
        </View>
        {photo ? (
          <>
            <Input value={note} onChangeText={setNote} placeholder={t.photoNote} maxLength={300} accessibilityLabel={t.photoNote} />
            <Button title={busy === "estimate" ? t.estimating : t.estimate} variant="primary" disabled={Boolean(busy)} onPress={() => void runEstimate()} />
          </>
        ) : null}
        <Text style={type.rowSubtitle}>{t.photoPrivacy}</Text>
      </Card>

      {busy === "photo" || busy === "estimate" ? <Loading /> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {estimate ? (
        <Card title={`${plateTotal(chosen)} ${t.kcal}`}>
          {estimate.note ? <Text style={type.rowSubtitle}>{estimate.note}</Text> : null}
          {drafts.map((draft, index) => (
            <View key={index} style={styles.item}>
              <CheckItem checked={draft.include} onPress={() => edit(index, { include: !draft.include })} label={draft.name} size={26} />
              <View style={{ flex: 1, gap: 6 }}>
                <Input value={draft.name} onChangeText={(name) => edit(index, { name })} accessibilityLabel={t.foodName} style={styles.small} />
                <View style={styles.meta}>
                  <Badge tone={draft.confidence === "high" ? "success" : draft.confidence === "low" ? "urgent" : "neutral"}>{t.confidenceNames[draft.confidence]}</Badge>
                  <Text style={type.rowSubtitle}>{[draft.portion, draft.grams ? `${Math.round(draft.grams)} g` : null, macroText(draft)].filter(Boolean).join(" · ")}</Text>
                </View>
              </View>
              <View style={{ width: 84 }}>
                <Input value={draft.caloriesText} onChangeText={(caloriesText) => edit(index, { caloriesText })} keyboardType="decimal-pad" accessibilityLabel={`${t.calories} ${draft.name}`} style={[styles.small, { textAlign: "center" }]} />
                <Text style={[type.hint, { textAlign: "center" }]}>{t.kcal}</Text>
              </View>
            </View>
          ))}
          {drafts.length ? (
            <>
              <Segments options={pickerTypes} value={mealType} onChange={setMealType} labels={t.mealTypeNames} />
              <Button title={`${t.logItems} (${chosen.length})`} variant="primary" disabled={Boolean(busy) || !chosen.length} onPress={() => void logAll()} />
            </>
          ) : null}
          <Text style={type.hint}>{t.estimateHint}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.tile, backgroundColor: colors.surfaceInset },
  row: { flexDirection: "row", gap: 8 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  small: { minHeight: 40, fontSize: 14 }
});
