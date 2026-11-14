import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type } from "@/components/drift";
import { Input } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { filterModels, PROVIDER_IDS, PROVIDERS, providerModel, providerState, providerSummary, rolesLine, type ModelKind, type Provider, type ProviderModel } from "@/lib/ai-providers";
import { digits, isArabic, t } from "@/lib/i18n";
import type { IntegrationsOverview } from "@/lib/integrations";

// The company's letter mark on its colour: a simple stand-in, not its logo.
export function ProviderMark({ provider, size = 40 }: { provider: Provider; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: provider.color }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={{ fontFamily: fonts.bold, color: provider.ink, fontSize: size * (provider.mark.length > 1 ? 0.36 : 0.46), writingDirection: "ltr" }}>{provider.mark}</Text>
    </View>
  );
}

// Every company as a tile, two to a row: its mark, name, what it does in Orbit, and whether it's connected.
export function ProviderGrid({ overview }: { overview: IntegrationsOverview }) {
  return (
    <View style={styles.grid}>
      {PROVIDER_IDS.map((id) => {
        const provider = PROVIDERS[id];
        const state = providerState(overview, id);
        return (
          <Pressable
            key={id}
            onPress={() => router.push({ pathname: "/ai-provider", params: { id } })}
            accessibilityRole="button"
            accessibilityLabel={`${provider.name}, ${providerSummary(provider, state)}`}
            style={({ pressed }) => [styles.tile, state.connected && styles.tileOn, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.tileTop}>
              <ProviderMark provider={provider} size={36} />
              {state.connected ? (
                <View style={styles.on}>
                  <Icon name="check" size={12} color={colors.accentInk} />
                </View>
              ) : null}
            </View>
            <Text style={type.rowTitle} numberOfLines={1}>
              {provider.name}
            </Text>
            <Text style={[type.rowSubtitle, { fontSize: 12 }]} numberOfLines={1}>
              {rolesLine(provider)}
            </Text>
            <Text style={[styles.status, state.connected && { color: colors.accentDeep }]} numberOfLines={1}>
              {state.isDefault ? t.pv.isDefault : state.connected ? t.pv.connected : t.pv.notConnected}
            </Text>
            <Text style={[styles.status, { writingDirection: isArabic ? "rtl" : "ltr" }]} numberOfLines={1}>
              {providerModel(state) ?? " "}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A searchable list of the company's models of one kind; the picked one is ticked. A name that isn't listed can
// still be typed and used.
export function ModelPicker({ models, kind, value, onPick, disabled }: { models: ProviderModel[]; kind: ModelKind; value: string | null; onPick: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { shown, more } = filterModels(models, kind, query);
  const typed = query.trim();
  const canType = typed.length > 1 && !shown.some((model) => model.id === typed);

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen((now) => !now)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.75 }]}
      >
        <Text style={[type.rowTitle, styles.ltr, !value && { color: colors.inkMuted }]} numberOfLines={1}>
          {value ?? t.pv.modelPick}
        </Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />
      </Pressable>
      {open ? (
        <View style={styles.list}>
          <Input accessibilityLabel={t.pv.modelSearch} placeholder={t.pv.modelSearch} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} />
          {shown.map((model) => (
            <Option
              key={model.id}
              label={model.id}
              detail={model.name}
              selected={model.id === value}
              disabled={disabled}
              onPress={() => {
                onPick(model.id);
                setOpen(false);
                setQuery("");
              }}
            />
          ))}
          {!shown.length && !canType ? <Text style={type.rowSubtitle}>{t.pv.modelNone}</Text> : null}
          {more ? <Text style={type.rowSubtitle}>{digits(t.pv.modelMore.replace("{n}", String(more)))}</Text> : null}
          {canType ? (
            <Option
              label={t.pv.modelTyped.replace("{name}", typed)}
              selected={false}
              disabled={disabled}
              onPress={() => {
                onPick(typed);
                setOpen(false);
                setQuery("");
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Option({ label, detail, selected, disabled, onPress }: { label: string; detail?: string | null; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.rowSubtitle, styles.ltr, { color: selected ? colors.accentDeep : colors.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[type.rowSubtitle, styles.ltr, { fontSize: 12 }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={14} color={colors.accentDeep} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 4 },
  tile: { flexBasis: "47%", flexGrow: 1, gap: 4, padding: 12, borderRadius: radius.tile, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, backgroundColor: colors.surfaceInset },
  tileOn: { borderColor: colors.accentLine },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  on: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  status: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  field: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  list: { gap: 6 },
  option: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  selected: { borderColor: colors.accentLine, backgroundColor: colors.accentTint },
  // A model name (English) still lines up with the Arabic text around it, as in the feature list.
  ltr: { flex: 1, writingDirection: isArabic ? "rtl" : "ltr" }
});
