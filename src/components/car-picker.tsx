import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { flip, Glass, Icon, type } from "@/components/drift";
import { Button, Input } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { carMakes, carModels, carName, carYears, filterChoices, parseKm } from "@/lib/car-catalog";
import { t } from "@/lib/i18n";

export type PickedCar = { name: string; plate: string | null; odometer_km: number | null };

// Make, then model, then year, then the optional details. Mount it to open; it starts clean each time.
export function CarPicker({ onClose, onAdd }: { onClose: () => void; onAdd: (car: PickedCar) => Promise<void> }) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [query, setQuery] = useState("");
  const [plate, setPlate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [saving, setSaving] = useState(false);

  const step = !make ? "make" : !model ? "model" : !year ? "year" : "details";
  const choices = step === "make" ? carMakes : step === "model" ? carModels(make) : carYears();
  const { matches, typed } = filterChoices(choices, query);
  // A year has to come from the list; a make or model can be anything.
  const rows = step !== "year" && typed ? [...matches, typed] : matches;
  const title = step === "make" ? t.carMake : step === "model" ? t.carModel : step === "year" ? t.carYear : carName(make, model, year);

  const pick = (choice: string) => {
    (step === "make" ? setMake : step === "model" ? setModel : setYear)(choice);
    setQuery("");
  };

  const back = () => {
    setQuery("");
    if (year) setYear("");
    else if (model) setModel("");
    else if (make) setMake("");
    else onClose();
  };

  const submit = async () => {
    setSaving(true);
    await onAdd({ name: carName(make, model, year), plate: plate.trim() || null, odometer_km: parseKm(odometer) });
    setSaving(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={back}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.cancel} />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.wrap}>
        <Glass style={[styles.sheet, step !== "details" && { flex: 1 }]}>
          <View style={styles.head}>
            <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t.back} style={[styles.back, flip]}>
              <Icon name="chevron-left" size={18} color={colors.ink} />
            </Pressable>
            <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={2}>
              {title}
            </Text>
            <View style={{ width: 36 }} />
          </View>
          {step === "details" ? (
            <View style={styles.details}>
              <Input placeholder={t.plateOptional} value={plate} onChangeText={setPlate} maxLength={20} autoCapitalize="characters" autoCorrect={false} />
              <Input placeholder={t.odometerOptional} value={odometer} onChangeText={setOdometer} keyboardType="number-pad" />
              <Button title={t.add} disabled={saving} onPress={() => void submit()} />
            </View>
          ) : (
            <>
              {/* The key clears the field's focus between steps; an empty list means typing is the only way on. */}
              <Input key={step} style={styles.search} placeholder={title} value={query} onChangeText={setQuery} maxLength={40} autoCorrect={false} autoFocus={choices.length === 0} keyboardType={step === "year" ? "number-pad" : "default"} />
              <FlatList
                data={rows}
                keyExtractor={(row) => row}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable onPress={() => pick(item)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceInset }]}>
                    <Text style={styles.rowText}>{item === typed ? `${t.add}: ${item}` : item}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 72 },
  // A margin, because KeyboardAvoidingView owns its own bottom padding.
  sheet: { borderRadius: 26, overflow: "hidden", marginBottom: 28 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  back: { width: 36, height: 36, borderRadius: radius.control, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  search: { marginHorizontal: 12, marginBottom: 8 },
  details: { gap: 10, paddingHorizontal: 12, paddingBottom: 14 },
  row: { minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.surfaceInset, paddingHorizontal: 16 },
  rowText: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink, textAlign: "left" }
});
