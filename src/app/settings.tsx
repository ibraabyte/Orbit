import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { isAppLockEnabled, setAppLockEnabled } from "@/components/app-lock";
import { Avatar, Card, Chevron, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { arePrayerAlertsEnabled, setPrayerAlertsEnabled } from "@/hooks/use-prayer-times";
import { signOut } from "@/lib/backend";
import { t, toggleLanguage } from "@/lib/i18n";

function Setting({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderTopWidth: 1, borderTopColor: colors.surfaceInset }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.rowTitle}>{label}</Text>
        {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function Settings() {
  const { data } = useDashboardData();
  const { toast } = useOverlays();
  const [lock, setLock] = useState(true);
  const [prayers, setPrayers] = useState(true);
  const name = data.profile?.display_name ?? "Orbit";

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void arePrayerAlertsEnabled().then(setPrayers);
  }, []);

  const track = { true: colors.accent, false: colors.hairline };

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}>
        <Avatar name={name} size={48} dark />
        <Text style={[type.title, { flex: 1, fontSize: 16 }]}>{name}</Text>
      </Card>
      <Card style={{ paddingVertical: 0, gap: 0, overflow: "hidden" }}>
        <View style={{ marginTop: -1 }}>
          <Setting label={t.faceId}>
            <Switch
              accessibilityLabel={t.faceId}
              trackColor={track}
              value={lock}
              onValueChange={(next) => {
                setLock(next);
                void setAppLockEnabled(next);
              }}
            />
          </Setting>
        </View>
        <Setting label={t.prayerAlerts} detail={t.prayerSource}>
          <Switch
            accessibilityLabel={t.prayerAlerts}
            trackColor={track}
            value={prayers}
            onValueChange={(next) => {
              setPrayers(next);
              void setPrayerAlertsEnabled(next);
            }}
          />
        </Setting>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const message = toggleLanguage();
            if (message) toast(message);
          }}
        >
          <Setting label={t.language}>
            <Text style={type.rowSubtitle}>{t.langLabel}</Text>
            <Chevron />
          </Setting>
        </Pressable>
      </Card>
      <Button title={t.signOut} onPress={() => void signOut()} />
    </Screen>
  );
}
