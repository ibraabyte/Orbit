import { Text, View } from "react-native";
import { type } from "@/components/drift";
import { Segments } from "@/components/screen";
import { t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, type AiChoiceName, type AiChoices } from "@/lib/integrations";

// Shown only when more than one AI is connected: which one answers this time. The default is picked to start with.
export function AiPicker({ choices, value, onChange, onShell }: { choices: AiChoices | null; value: AiChoiceName | null; onChange: (next: AiChoiceName) => void; onShell?: boolean }) {
  if (!choices || choices.choices.length < 2 || !value) return null;
  const options = choices.choices.map((choice) => choice.provider);
  return (
    <View style={{ gap: 6 }}>
      <Text style={onShell ? type.shellMeta : type.tileLabel}>{t.aiUseThisTime}</Text>
      <Segments small options={options} labels={AI_CHOICE_NAMES} value={value} onChange={onChange} />
    </View>
  );
}
