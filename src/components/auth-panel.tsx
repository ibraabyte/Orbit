import type { ReactNode } from "react";
import { Text, View, type TextInputProps } from "react-native";
import { Badge, Brand, Card, type } from "@/components/drift";
import { Input } from "@/components/screen";

// The web version's auth panel: Orbit mark and a "Private workspace" badge on top,
// a heading and one line of copy, then labelled fields on a cream card.
export function AuthPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Brand size={32} />
        <Badge tone="accent">Private workspace</Badge>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={type.h1}>{title}</Text>
        <Text style={type.shellMeta}>{subtitle}</Text>
      </View>
      <Card>
        <View style={{ gap: 14 }}>{children}</View>
      </Card>
    </>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <Input accessibilityLabel={label} {...props} />
    </View>
  );
}
