import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, type } from "@/components/drift";
import { FoodLogPanel } from "@/components/food-log-panel";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen, ui } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { ApiError } from "@/lib/api";
import { getApi } from "@/lib/backend";
import { foodApi, isBarcode, logCandidate, type FoodCandidate, type MealType } from "@/lib/food-log";
import { t } from "@/lib/i18n";

// Food packaging uses EAN and UPC codes.
const barcodeTypes = ["ean13", "ean8", "upc_a", "upc_e"] as const;

export default function FoodScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const { toast } = useOverlays();
  const [found, setFound] = useState<FoodCandidate | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  // The camera reports the same code many times a second; read one at a time.
  const handled = useRef<string | null>(null);

  async function onScanned({ data }: BarcodeScanningResult) {
    const code = data.trim();
    if (handled.current || !isBarcode(code)) return;
    handled.current = code;
    setLooking(true);
    setError(null);
    try {
      setFound(await foodApi.barcode(getApi(), code));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) setMissing(code);
      else setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLooking(false);
    }
  }

  function again() {
    handled.current = null;
    setFound(null);
    setMissing(null);
    setError(null);
  }

  async function log(candidate: FoodCandidate, servings: number, mealType: MealType) {
    setBusy(true);
    try {
      await logCandidate(getApi(), candidate, servings, mealType);
      toast(t.logged);
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const scanning = !found && !missing && !looking && !error;

  return (
    <Screen>
      {!permission ? (
        <Loading />
      ) : !permission.granted ? (
        <Card>
          <EmptyState icon="camera">{t.cameraNeeded}</EmptyState>
          <Button title={t.allowCamera} variant="primary" onPress={() => void requestPermission()} />
        </Card>
      ) : (
        <>
          <View style={styles.frame}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }} onBarcodeScanned={scanning ? (result) => void onScanned(result) : undefined} />
            <View pointerEvents="none" style={styles.target} />
          </View>
          {scanning ? <Text style={[type.shellMuted, { textAlign: "center" }]}>{t.pointAtBarcode}</Text> : null}
          {looking ? <Loading /> : null}
        </>
      )}

      {error ? <Text style={ui.error}>{error}</Text> : null}
      {found ? <FoodLogPanel food={found} busy={busy} onLog={(servings, mealType) => void log(found, servings, mealType)} /> : null}
      {missing ? (
        <Card title={t.notInDatabase}>
          <Text style={type.rowSubtitle}>{missing}</Text>
          <Button title={t.newFood} variant="primary" onPress={() => router.replace({ pathname: "/food-add", params: { mode: "new", barcode: missing } })} />
        </Card>
      ) : null}
      {found || missing || error ? <Button title={t.scanAgain} variant="outline" onPress={again} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { height: 300, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  target: { width: "72%", height: 120, borderRadius: radius.tile, borderWidth: 2, borderColor: colors.accent }
});
