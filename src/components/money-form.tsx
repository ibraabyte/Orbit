import { useState } from "react";
import { Text, View } from "react-native";
import { RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input } from "@/components/screen";
import { t } from "@/lib/i18n";
import { parseMoneyInput } from "@/lib/wealth";

/** An amount box with its currency beside it, so a wrong currency is seen before saving. */
export function AmountField({ label, value, onChange, currency, onSubmit, autoFocus }: { label: string; value: string; onChange: (text: string) => void; currency: string; onSubmit?: () => void; autoFocus?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Input accessibilityLabel={`${label} (${currency})`} placeholder={label} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" returnKeyType="done" onSubmitEditing={onSubmit} autoFocus={autoFocus} />
      </View>
      <Text style={type.barValue}>{currency}</Text>
    </View>
  );
}

/** One amount typed in place (a new balance, a new value, money added), with Cancel and Save. */
export function AmountEditor({
  label,
  currency,
  initial = "",
  allowNegative,
  allowZero = true,
  onSave,
  onCancel
}: {
  label: string;
  currency: string;
  initial?: string;
  allowNegative?: boolean;
  allowZero?: boolean;
  onSave: (amount: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const amount = parseMoneyInput(text, { allowNegative, allowZero });
  const save = () => amount !== null && onSave(amount);
  return (
    <View style={{ gap: 8, paddingVertical: 6 }}>
      <AmountField label={label} value={text} onChange={setText} currency={currency} onSubmit={save} autoFocus />
      <FormButtons onCancel={onCancel} onSave={save} disabled={amount === null} />
    </View>
  );
}

export function FormButtons({ onCancel, onSave, disabled, saveLabel = t.save }: { onCancel: () => void; onSave: () => void; disabled?: boolean; saveLabel?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Button variant="outline" title={t.cancel} onPress={onCancel} />
      </View>
      <View style={{ flex: 1 }}>
        <Button variant="primary" title={saveLabel} disabled={disabled} onPress={onSave} />
      </View>
    </View>
  );
}

/** A small caption above a field. */
export function FieldLabel({ children }: { children: string }) {
  return <Text style={type.rowSubtitle}>{children}</Text>;
}

/** Picks one of many options from a sheet; the button shows the current choice. */
export function ChoiceButton<T extends string>({ title, value, options, labels, onChange }: { title: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (next: T) => void }) {
  const { sheet } = useOverlays();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={[type.rowSubtitle, { flex: 1 }]}>{title}</Text>
      <RowButton outline label={labels[value]} onPress={() => sheet({ title, options: options.map((option) => ({ label: `${option === value ? "● " : ""}${labels[option]}`, run: () => onChange(option) })) })} />
    </View>
  );
}
