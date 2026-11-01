import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { flip, Icon, type } from "@/components/drift";
import { colors, fonts, radius } from "@/components/theme";
import { formatDate, t } from "@/lib/i18n";

// One action sheet, one date picker and one toast for the whole app, replacing alerts and typed dates.

export type SheetOption = { label: string; run: () => void; destructive?: boolean; keepOpen?: boolean };
type SheetRequest = { title: string; detail?: string; options: SheetOption[] };
type PickerRequest = { title: string; initial: Date; resolve: (date: string | null) => void };

const OverlayContext = createContext<{
  sheet: (request: SheetRequest) => void;
  toast: (message: string) => void;
  pickDate: (title: string, initial?: string | null) => Promise<string | null>;
} | null>(null);

export function useOverlays() {
  const value = useContext(OverlayContext);
  if (!value) throw new Error("useOverlays must be used inside OverlayProvider.");
  return value;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((next: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessage(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  const value = useMemo(
    () => ({
      sheet: setSheet,
      toast,
      pickDate: (title: string, initial?: string | null) =>
        new Promise<string | null>((resolve) => setPicker({ title, initial: initial ? new Date(initial) : new Date(), resolve }))
    }),
    [toast]
  );

  const closePicker = (date: string | null) => {
    picker?.resolve(date);
    setPicker(null);
  };

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <Modal visible={Boolean(sheet)} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} accessibilityLabel={t.cancel} />
        {sheet ? (
          <View style={styles.sheetWrap}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={[type.title, { textAlign: "center" }]}>{sheet.title}</Text>
                {sheet.detail ? <Text style={[type.rowSubtitle, { textAlign: "center" }]}>{sheet.detail}</Text> : null}
              </View>
              {sheet.options.map((option) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  style={styles.option}
                  onPress={() => {
                    if (!option.keepOpen) setSheet(null);
                    option.run();
                  }}
                >
                  <Text style={[styles.optionText, option.destructive && { fontFamily: fonts.bold, color: colors.urgent }]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" style={[styles.sheet, styles.cancel]} onPress={() => setSheet(null)}>
              <Text style={[styles.optionText, { fontFamily: fonts.bold }]}>{t.cancel}</Text>
            </Pressable>
          </View>
        ) : null}
      </Modal>
      <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => closePicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => closePicker(null)} accessibilityLabel={t.cancel} />
        {picker ? <DatePicker key={picker.title} title={picker.title} initial={picker.initial} onPick={closePicker} /> : null}
      </Modal>
      {message ? (
        <View pointerEvents="none" style={styles.toast} accessibilityLiveRegion="polite">
          <View style={styles.toastMark}>
            <Icon name="check" size={14} color={colors.accentInk} />
          </View>
          <Text style={styles.toastText}>{message}</Text>
        </View>
      ) : null}
    </OverlayContext.Provider>
  );
}

// Local calendar date as YYYY-MM-DD, the shape date columns use.
export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function DatePicker({ title, initial, onPick }: { title: string; initial: Date; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const selected = toDateKey(initial);
  const today = toDateKey(new Date());
  const leading = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(leading).fill(null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  const weekdays = Array.from({ length: 7 }, (_, index) => formatDate(new Date(2023, 0, 1 + index), { weekday: "narrow" }));
  const step = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <View style={[styles.sheetWrap, styles.picker]}>
      <Text style={[type.rowSubtitle, { textAlign: "center" }]}>{title}</Text>
      <View style={styles.pickerHead}>
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.pickerStep, flip]}>
          <Icon name="chevron-left" size={18} color={colors.ink} />
        </Pressable>
        <Text style={type.title}>{formatDate(month, { month: "long", year: "numeric" })}</Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next month" style={[styles.pickerStep, flip]}>
          <Icon name="chevron-right" size={18} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.pickerGrid}>
        {weekdays.map((day, index) => (
          <Text key={index} style={[styles.pickerCell, type.tileLabel, { textAlign: "center", height: 20 }]}>
            {day}
          </Text>
        ))}
        {cells.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={styles.pickerCell} />;
          const key = toDateKey(date);
          const on = key === selected;
          return (
            <Pressable key={key} onPress={() => onPick(key)} accessibilityRole="button" accessibilityLabel={formatDate(date, { dateStyle: "long" })} accessibilityState={{ selected: on }} style={[styles.pickerCell, styles.pickerDay, on && { backgroundColor: colors.accent }, !on && key === today && { backgroundColor: colors.surfaceInset }]}>
              <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 14, color: on ? colors.accentInk : colors.ink }}>{formatDate(date, { day: "numeric" })}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { position: "absolute", left: 12, right: 12, bottom: 28, gap: 8 },
  sheet: { backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" },
  sheetHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 2 },
  option: { minHeight: 52, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.surfaceInset, paddingHorizontal: 16 },
  optionText: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink, textAlign: "center" },
  cancel: { minHeight: 52, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: 16, right: 16, bottom: 108, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.urgent, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  toastMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  toastText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.urgentInk },
  picker: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10 },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerStep: { width: 36, height: 36, borderRadius: radius.control, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap" },
  pickerCell: { width: `${100 / 7}%`, height: 40 },
  pickerDay: { alignItems: "center", justifyContent: "center", borderRadius: radius.control }
});
