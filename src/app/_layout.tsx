import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { ServerStatusProvider } from "@/hooks/use-server-status";
import { hasServer, watchSession, type AppSession } from "@/lib/backend";

const stackScreens = [
  ["health", "Health"],
  ["whoop", "WHOOP"],
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

const configured = hasServer();

export default function RootLayout() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);

  useEffect(() => (configured ? watchSession(setSession) : undefined), []);

  if (!configured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text>Add EXPO_PUBLIC_API_URL (Orbit's server) to .env.local, then restart.</Text>
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
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );

  return (
    <>
      <StatusBar style="auto" />
      {session ? (
        <AppLock>
          <DashboardDataProvider key={session.userId} userId={session.userId}>
            <ServerStatusProvider>{stack}</ServerStatusProvider>
            {/* After the stack, so a notification tap that opened the app navigates once it's mounted. */}
            <ReminderNotifications />
          </DashboardDataProvider>
        </AppLock>
      ) : (
        stack
      )}
    </>
  );
}
