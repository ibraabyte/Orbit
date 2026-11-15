import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Icon, type, type IconName } from "@/components/drift";
import { Input } from "@/components/screen";
import { colors, fonts, radius, type Color } from "@/components/theme";
import { filterModels, modelMaker, PROVIDER_IDS, PROVIDERS, providerState, providerSummary, rolesLine, type ModelKind, type Provider, type ProviderId, type ProviderModel } from "@/lib/ai-providers";
import { digits, isArabic, t } from "@/lib/i18n";
import type { IntegrationsOverview } from "@/lib/integrations";

// The company's own logo on a white tile (assets/brand/ai, from LobeHub's MIT icon set), to show whose model it is.
const LOGOS: Record<ProviderId, ImageSourcePropType> = {
  anthropic: require("../../assets/brand/ai/anthropic.png"),
  openai: require("../../assets/brand/ai/openai.png"),
  gemini: require("../../assets/brand/ai/gemini.png"),
  openrouter: require("../../assets/brand/ai/openrouter.png"),
  groq: require("../../assets/brand/ai/groq.png"),
  elevenlabs: require("../../assets/brand/ai/elevenlabs.png")
};

export function ProviderMark({ provider, size = 40 }: { provider: Provider; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28 }]} accessibilityElementsHidden importantForAccessibility="no">
      <Image source={LOGOS[provider.id]} style={{ width: size * 0.6, height: size * 0.6 }} resizeMode="contain" />
    </View>
  );
}

// Every company as a tile, two to a row: its mark, name, what it does in Orbit, and whether it's connected.
// What a company does in Orbit: written answers, speech to text, the voice call.
const ROLE_ICONS: Record<Provider["roles"][number], IconName> = { text: "message-circle", speech: "mic", call: "phone" };

// ponytail: hidden for now to keep the page simple (the code stays). A hidden company still shows once it's connected,
// so it can be changed or removed. Take an id out of this list to bring its tile back.
const HIDDEN: ProviderId[] = ["openrouter", "groq"];

export function ProviderGrid({ overview }: { overview: IntegrationsOverview }) {
  const shown = PROVIDER_IDS.filter((id) => !HIDDEN.includes(id) || providerState(overview, id).connected);
  return (
    <TileGrid>
      {shown.map((id) => {
        const provider = PROVIDERS[id];
        const state = providerState(overview, id);
        return (
          <ConnectionTile
            key={id}
            mark={<ProviderMark provider={provider} size={36} />}
            name={provider.name}
            // A star on the default AI, a tick on any other connected one.
            badge={state.connected ? (state.isDefault ? "star" : "check") : null}
            icons={provider.roles.map((role) => ROLE_ICONS[role])}
            label={`${provider.name}, ${rolesLine(provider)}, ${providerSummary(provider, state)}`}
            onPress={() => router.push({ pathname: "/ai-provider", params: { id } })}
          />
        );
      })}
    </TileGrid>
  );
}

// Tiles two to a row; one alone keeps the same width, so every section looks alike.
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

// Any other service's own logo on the same white square (Twilio).
export function LogoMark({ source, size = 36 }: { source: ImageSourcePropType; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28 }]} accessibilityElementsHidden importantForAccessibility="no">
      <Image source={source} style={{ width: size * 0.6, height: size * 0.6 }} resizeMode="contain" />
    </View>
  );
}

// An icon on the same white square as a company logo, for a service without one (WHOOP, Seerr).
export function IconMark({ name, size = 36, color = colors.ink }: { name: IconName; size?: number; color?: Color }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28 }]} accessibilityElementsHidden importantForAccessibility="no">
      <Icon name={name} size={size * 0.5} color={color} />
    </View>
  );
}

// One connection: its mark, name, a badge (connected, default, needs attention) and small icons for what it brings.
// Connected tiles are warm and solid; one not connected yet is an outline with a dimmed mark and a "+".
// wide: the only tile in its card, laid out as one full-width row instead of half a row.
// checked: the tile is an on/off switch (Notifications, Sections), read out as one.
export function ConnectionTile({ mark, name, badge, icons = [], label, onPress, wide, checked }: { mark: ReactNode; name: string; badge: "star" | "check" | "alert" | null; icons?: IconName[]; label: string; onPress?: () => void; wide?: boolean; checked?: boolean }) {
  const on = badge !== null;
  const corner = (
    <View style={[styles.on, !on && styles.off]}>
      <Icon name={badge === "alert" ? "alert-circle" : (badge ?? "plus")} size={12} color={on ? colors.accentInk : colors.inkMuted} />
    </View>
  );
  const text = (
    <>
      <Text style={[type.rowTitle, !on && { color: colors.inkMuted }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.roles}>
        {icons.map((icon) => (
          <Icon key={icon} name={icon} size={14} color={on ? colors.accentDeep : colors.inkFaint} />
        ))}
      </View>
    </>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={checked === undefined ? "button" : "switch"} accessibilityState={checked === undefined ? undefined : { checked, disabled: !onPress }} accessibilityLabel={label} style={({ pressed }) => [styles.tile, wide && styles.wide, on ? styles.tileOn : styles.tileOff, pressed && { opacity: 0.75 }]}>
      {wide ? (
        <>
          <View style={!on && { opacity: 0.55 }}>{mark}</View>
          <View style={{ flex: 1, gap: 2 }}>{text}</View>
          {corner}
        </>
      ) : (
        <>
          <View style={styles.tileTop}>
            <View style={!on && { opacity: 0.55 }}>{mark}</View>
            {corner}
          </View>
          {text}
        </>
      )}
    </Pressable>
  );
}

// One simple choice (the AI for writing, the voice model): its current pick with a mark, opening to the other picks
// in place. With one pick only it just shows it.
export type Pick = { key: string; mark: ReactNode; label: string };
// summary: what the closed row shows, when it differs from the picked option's own label.
export function PickRow({ icon, title, picks, value, onPick, disabled, summary }: { icon: IconName; title: string; picks: Pick[]; value: string | null; onPick: (key: string) => void; disabled?: boolean; summary?: Pick }) {
  const [open, setOpen] = useState(false);
  const current = summary ?? picks.find((pick) => pick.key === value) ?? null;
  const canPick = picks.length > 1;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen((now) => !now)}
        disabled={!canPick || disabled}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${current?.label ?? "—"}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.75 }]}
      >
        <Icon name={icon} size={18} color={colors.inkMuted} />
        <Text style={[type.rowTitle, { flex: 1 }]}>{title}</Text>
        {current ? current.mark : null}
        <Text style={[type.rowSubtitle, { maxWidth: "45%" }]} numberOfLines={1}>
          {current?.label ?? "—"}
        </Text>
        {canPick ? <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} /> : null}
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {picks.map((pick, index) => (
            <Pressable
              key={pick.key}
              onPress={() => {
                setOpen(false);
                if (pick.key !== value) onPick(pick.key);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: pick.key === value }}
              style={({ pressed }) => [styles.option, index > 0 && styles.divider, pick.key === value && styles.selected, pressed && { opacity: 0.7 }]}
            >
              {pick.mark}
              <Text style={[type.rowTitle, { flex: 1 }]} numberOfLines={1}>
                {pick.label}
              </Text>
              {pick.key === value ? <Icon name="check" size={16} color={colors.accentDeep} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The company's models of one kind as one grouped list: each with its maker's mark, readable name and id; the picked
// one is ticked. Search shows once the list is long. A name that isn't listed can still be typed and used.
export function ModelPicker({ provider, models, kind, value, onPick, disabled }: { provider: Provider; models: ProviderModel[]; kind: ModelKind; value: string | null; onPick: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { shown, more } = filterModels(models, kind, query);
  const typed = query.trim();
  const canType = typed.length > 1 && !shown.some((model) => model.id === typed);
  const searchable = models.filter((model) => model.kind === kind).length > 8;
  const current = models.find((model) => model.id === value);
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen((now) => !now)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.75 }]}
      >
        <ProviderMark provider={PROVIDERS[modelMaker(provider.id, value)]} size={34} />
        <ModelName name={current?.name ?? value ?? t.pv.modelPick} id={current?.name ? value : null} muted={!value} />
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />
      </Pressable>
      {open ? (
        <>
          {searchable ? <Input accessibilityLabel={t.pv.modelSearch} placeholder={t.pv.modelSearch} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} /> : null}
          {shown.length || canType ? (
            <View style={styles.list}>
              {shown.map((model, index) => (
                <Option key={model.id} first={index === 0} mark={PROVIDERS[modelMaker(provider.id, model.id)]} name={model.name ?? model.id} id={model.name ? model.id : null} selected={model.id === value} disabled={disabled} onPress={() => pick(model.id)} />
              ))}
              {canType ? <Option first={!shown.length} mark={provider} name={t.pv.modelTyped.replace("{name}", typed)} id={null} selected={false} disabled={disabled} onPress={() => pick(typed)} /> : null}
            </View>
          ) : (
            <Text style={type.rowSubtitle}>{t.pv.modelNone}</Text>
          )}
          {more ? <Text style={type.rowSubtitle}>{digits(t.pv.modelMore.replace("{n}", String(more)))}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

function ModelName({ name, id, muted }: { name: string; id: string | null; muted?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[type.rowTitle, styles.ltr, muted && { color: colors.inkMuted }]} numberOfLines={1}>
        {name}
      </Text>
      {id ? (
        <Text style={[type.rowSubtitle, styles.ltr, { fontSize: 12 }]} numberOfLines={1}>
          {id}
        </Text>
      ) : null}
    </View>
  );
}

function Option({ first, mark, name, id, selected, disabled, onPress }: { first: boolean; mark: Provider; name: string; id: string | null; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [styles.option, !first && styles.divider, selected && styles.selected, pressed && { opacity: 0.7 }]}
    >
      <ProviderMark provider={mark} size={28} />
      <ModelName name={name} id={id} />
      {selected ? <Icon name="check" size={16} color={colors.accentDeep} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", justifyContent: "center", borderCurve: "continuous", backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 4 },
  tile: { flexBasis: "47%", flexGrow: 1, maxWidth: "48%", gap: 4, padding: 14, borderRadius: radius.tile, borderCurve: "continuous", borderWidth: 1 },
  tileOn: { borderColor: colors.accentLine, backgroundColor: colors.surface },
  tileOff: { borderColor: colors.hairline, borderStyle: "dashed", backgroundColor: "transparent" },
  wide: { flexBasis: "100%", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 12 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  on: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  off: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.hairline },
  roles: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  status: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  field: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  list: { borderRadius: radius.tile, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, backgroundColor: colors.surface },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  selected: { backgroundColor: colors.accentTint },
  // A model name (English) still lines up with the Arabic text around it, as in the feature list.
  ltr: { flex: 1, writingDirection: isArabic ? "rtl" : "ltr" }
});
