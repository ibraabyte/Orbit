import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { ActionSheetIOS, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Glass, Icon, type } from "@/components/drift";
import { colors, fonts, radius, scrim, shadow, space, textSize, usePalette } from "@/components/theme";
import { t } from "@/lib/i18n";

// One action sheet, one date picker and one toast for the whole app, replacing alerts and typed dates. The sheet and the
// date picker are the system's own: the iOS action sheet and calendar, the Material date dialog on Android.

export type SheetOption = { label: string; run: () => void; destructive?: boolean };
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

// Sheets and the toast keep a phone width on iPad, centered.
function useSides() {
  const { width } = useWindowDimensions();
  const side = Math.max(12, (width - 540) / 2);
  return { left: side, right: side };
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const sides = useSides();
  const palette = usePalette();
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
      sheet: process.env.EXPO_OS === "ios" ? (request: SheetRequest) => showActionSheet(request, palette.link) : setSheet,
      toast,
      pickDate: (title: string, initial?: string | null) =>
        new Promise<string | null>((resolve) => setPicker({ title, initial: initial ? new Date(initial) : new Date(), resolve }))
    }),
    [toast, palette.link]
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
          <View style={[styles.sheetWrap, sides]}>
            <Glass style={styles.sheet}>
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
                    setSheet(null);
                    option.run();
                  }}
                >
                  <Text style={[styles.optionText, option.destructive && { fontFamily: fonts.bold, color: colors.dangerOnShell }]}>{option.label}</Text>
                </Pressable>
              ))}
            </Glass>
            <Glass interactive style={styles.sheet}>
              <Pressable accessibilityRole="button" style={styles.cancel} onPress={() => setSheet(null)}>
                <Text style={[styles.optionText, { fontFamily: fonts.bold }]}>{t.cancel}</Text>
              </Pressable>
            </Glass>
          </View>
        ) : null}
      </Modal>
      {picker && process.env.EXPO_OS === "android" ? (
        // The Material dialog opens when this mounts; it answers once, picked or cancelled.
        <DateTimePicker value={picker.initial} accentColor={palette.accent} onValueChange={(_, date) => closePicker(toDateKey(date))} onDismiss={() => closePicker(null)} />
      ) : (
        <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => closePicker(null)}>
          <Pressable style={styles.backdrop} onPress={() => closePicker(null)} accessibilityLabel={t.cancel} />
          {picker ? <DatePicker key={picker.title} title={picker.title} initial={picker.initial} accent={palette.link} onPick={closePicker} /> : null}
        </Modal>
      )}
      {message ? (
        <View pointerEvents="none" style={[styles.toastWrap, sides]} accessibilityLiveRegion="polite">
          <View style={styles.toast}>
            <View style={styles.toastMark}>
              <Icon name="check" size={14} color={colors.accentInk} />
            </View>
            <Text style={styles.toastText}>{message}</Text>
          </View>
        </View>
      ) : null}
    </OverlayContext.Provider>
  );
}

// Local calendar date as YYYY-MM-DD, the shape date columns use.
export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// iOS: the system calendar in a sheet. A tap on a day isn't final (the month and year wheels change the date too), so
// Done confirms; the backdrop cancels.
function DatePicker({ title, initial, accent, onPick }: { title: string; initial: Date; accent: string; onPick: (date: string) => void }) {
  const sides = useSides();
  const [date, setDate] = useState(initial);
  return (
    <Glass style={[styles.sheetWrap, styles.picker, sides]}>
      <View style={styles.pickerHead}>
        <Text style={[type.title, { flexShrink: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={() => onPick(toDateKey(date))} accessibilityRole="button" hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={[type.link, { fontFamily: fonts.bold }]}>{t.done}</Text>
        </Pressable>
      </View>
      <DateTimePicker value={date} display="inline" accentColor={accent} onValueChange={(_, next) => setDate(next)} />
    </Glass>
  );
}

// The system action sheet, with Cancel last and destructive options in red.
function showActionSheet({ title, detail, options }: SheetRequest, tint: string) {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message: detail,
      options: [...options.map((option) => option.label), t.cancel],
      cancelButtonIndex: options.length,
      destructiveButtonIndex: options.flatMap((option, index) => (option.destructive ? [index] : [])),
      tintColor: tint
    },
    (index) => options[index]?.run()
  );
}

// The toast sits just above the floating tab bar.
const TOAST_BOTTOM = 108;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: scrim },
  sheetWrap: { position: "absolute", left: space.md, right: space.md, bottom: space.xxl, gap: space.sm },
  sheet: { borderRadius: radius.xl, borderCurve: "continuous" },
  sheetHeader: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.xxs },
  option: { minHeight: 52, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.surfaceInset, paddingHorizontal: space.lg },
  optionText: { fontFamily: fonts.medium, fontSize: textSize.callout, color: colors.ink, textAlign: "center" },
  // The toast is the one pale floating thing: dark text, a sand check.
  cancel: { minHeight: 52, alignItems: "center", justifyContent: "center" },
  toastWrap: { position: "absolute", left: space.lg, right: space.lg, bottom: TOAST_BOTTOM },
  toast: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, borderCurve: "continuous", backgroundColor: colors.urgent, paddingHorizontal: space.lg, paddingVertical: space.md, boxShadow: shadow.floating },
  toastMark: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  toastText: { flex: 1, fontFamily: fonts.medium, fontSize: textSize.subheadline, color: colors.urgentInk },
  picker: { borderRadius: radius.xl, borderCurve: "continuous", padding: space.lg, gap: space.md },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 44 }
});
