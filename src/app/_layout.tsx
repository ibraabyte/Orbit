import type { Session } from "@supabase/supabase-js";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { ServerStatusProvider } from "@/hooks/use-server-status";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";

const stackScreens = [
  ["health", "Health"],
  ["food", "Food"],
  ["finance", "Finance"],
  ["people", "People"],
  ["habits", "Habits"],
  ["goals", "Goals"],
  ["journal", "Journal"],
  ["library", "Library"],
  ["vehicles", "Car"],
  ["media", "Movies & TV"],
  ["servers", "Servers"],
  ["settings", "Settings"]
] as const;

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseEnv()) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart.</Text>
      </View>
    );
  }

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        {stackScreens.map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ headerShown: true, title, headerLargeTitle: true, headerBackTitle: "More" }} />
        ))}
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );

  return (
    <>
      <StatusBar style="auto" />
      {session ? (
        <AppLock>
          <DashboardDataProvider userId={session.user.id}>
            <ReminderNotifications />
            <ServerStatusProvider>{stack}</ServerStatusProvider>
          </DashboardDataProvider>
        </AppLock>
      ) : (
        stack
      )}
    </>
  );
}
