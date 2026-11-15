import { useState } from "react";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { FlatList, Image, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Chips } from "@/components/chips";
import { flip, Glass, Icon, pressedFade, type } from "@/components/drift";
import { Button, Input } from "@/components/screen";
import { colors, fonts, radius, scrim, space, textSize, type Color } from "@/components/theme";
import { carMakes, carModels, carName, carYears, filterChoices, parseKm } from "@/lib/car-catalog";
import { t } from "@/lib/i18n";
import { BODY_TYPES, type BodyType } from "@/lib/types";

export type PickedCar = { name: string; plate: string | null; odometer_km: number | null; body_type: BodyType | null };

// Each make's own logo (assets/brand/cars, from filippofilip95/car-logos-dataset). A make typed in by hand has none.
const LOGOS: Record<string, ImageSourcePropType> = {
  Audi: require("../../assets/brand/cars/audi.png"),
  BMW: require("../../assets/brand/cars/bmw.png"),
  BYD: require("../../assets/brand/cars/byd.png"),
  Cadillac: require("../../assets/brand/cars/cadillac.png"),
  Changan: require("../../assets/brand/cars/changan.png"),
  Chery: require("../../assets/brand/cars/chery.png"),
  Chevrolet: require("../../assets/brand/cars/chevrolet.png"),
  Chrysler: require("../../assets/brand/cars/chrysler.png"),
  Dodge: require("../../assets/brand/cars/dodge.png"),
  Ford: require("../../assets/brand/cars/ford.png"),
  GMC: require("../../assets/brand/cars/gmc.png"),
  GWM: require("../../assets/brand/cars/great-wall.png"),
  Geely: require("../../assets/brand/cars/geely.png"),
  Genesis: require("../../assets/brand/cars/genesis.png"),
  Haval: require("../../assets/brand/cars/haval.png"),
  Honda: require("../../assets/brand/cars/honda.png"),
  Hyundai: require("../../assets/brand/cars/hyundai.png"),
  Infiniti: require("../../assets/brand/cars/infiniti.png"),
  Isuzu: require("../../assets/brand/cars/isuzu.png"),
  Jaguar: require("../../assets/brand/cars/jaguar.png"),
  Jeep: require("../../assets/brand/cars/jeep.png"),
  Jetour: require("../../assets/brand/cars/jetour.png"),
  Kia: require("../../assets/brand/cars/kia.png"),
  "Land Rover": require("../../assets/brand/cars/land-rover.png"),
  Lexus: require("../../assets/brand/cars/lexus.png"),
  Lincoln: require("../../assets/brand/cars/lincoln.png"),
  Lucid: require("../../assets/brand/cars/lucid.png"),
  MG: require("../../assets/brand/cars/mg.png"),
  Mazda: require("../../assets/brand/cars/mazda.png"),
  "Mercedes-Benz": require("../../assets/brand/cars/mercedes-benz.png"),
  Mitsubishi: require("../../assets/brand/cars/mitsubishi.png"),
  Nissan: require("../../assets/brand/cars/nissan.png"),
  Peugeot: require("../../assets/brand/cars/peugeot.png"),
  Porsche: require("../../assets/brand/cars/porsche.png"),
  Ram: require("../../assets/brand/cars/ram.png"),
  Renault: require("../../assets/brand/cars/renault.png"),
  Suzuki: require("../../assets/brand/cars/suzuki.png"),
  Tesla: require("../../assets/brand/cars/tesla.png"),
  Toyota: require("../../assets/brand/cars/toyota.png"),
  Volkswagen: require("../../assets/brand/cars/volkswagen.png"),
  Volvo: require("../../assets/brand/cars/volvo.png")
};

const bodySymbols: Record<BodyType, SFSymbol> = {
  sedan: "car.side.fill",
  hatchback: "car.fill",
  coupe: "convertible.side.fill",
  suv: "suv.side.fill",
  pickup: "truck.pickup.side.fill",
  van: "bus.fill"
};

// The car's shape. Android has no shape drawings, so it shows the one truck icon.
export function BodyIcon({ body, size, color }: { body: BodyType | null; size: number; color: Color }) {
  if (process.env.EXPO_OS !== "ios") return <Icon name="truck" size={size} color={color} />;
  return <SymbolView name={body ? bodySymbols[body] : "car.side.fill"} size={size} tintColor={color} weight="medium" accessibilityElementsHidden importantForAccessibility="no" />;
}

// The make's logo on a white tile, or nothing when there is no logo for it.
export function CarLogo({ make, size = 44 }: { make: string | null; size?: number }) {
  const logo = make ? LOGOS[make] : undefined;
  if (!logo) return null;
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.28 }]} accessibilityElementsHidden importantForAccessibility="no">
      <Image source={logo} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
    </View>
  );
}

// Make, then model, then year, then the optional details. Mount it to open; it starts clean each time.
export function CarPicker({ onClose, onAdd }: { onClose: () => void; onAdd: (car: PickedCar) => Promise<void> }) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [query, setQuery] = useState("");
  const [plate, setPlate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [body, setBody] = useState<BodyType | null>(null);
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
    await onAdd({ name: carName(make, model, year), plate: plate.trim() || null, odometer_km: parseKm(odometer), body_type: body });
    setSaving(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={back}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.cancel} />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.wrap}>
        <Glass style={[styles.sheet, step !== "details" && { flex: 1 }]}>
          <View style={styles.head}>
            <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t.back} style={({ pressed }) => [styles.back, flip, pressed && pressedFade]}>
              <Icon name="chevron-left" size={18} color={colors.ink} />
            </Pressable>
            <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={2}>
              {title}
            </Text>
            <View style={{ width: 36 }} />
          </View>
          {step === "details" ? (
            <View style={styles.details}>
              <Text style={type.tileLabel}>{t.carShape}</Text>
              <Chips options={BODY_TYPES} value={body} onChange={setBody} label={(option) => t.bodyTypes[option]} />
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
                    {step === "make" ? <CarLogo make={item} size={32} /> : null}
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: scrim },
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.md, paddingTop: space.giant },
  // A margin, because KeyboardAvoidingView owns its own bottom padding.
  sheet: { borderRadius: radius.xxl, overflow: "hidden", marginBottom: space.xxl },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md },
  back: { width: 36, height: 36, borderRadius: radius.control, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  search: { marginHorizontal: space.md, marginBottom: space.sm },
  details: { gap: space.md, paddingHorizontal: space.md, paddingBottom: space.lg },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: colors.surfaceInset, paddingHorizontal: space.lg },
  logo: { alignItems: "center", justifyContent: "center", borderCurve: "continuous", backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: textSize.callout, color: colors.ink, textAlign: "left" }
});
