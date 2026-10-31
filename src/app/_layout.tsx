import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold
} from "@expo-google-fonts/space-grotesk";
import Feather from "@expo/vector-icons/Feather";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { colors, fonts } from "@/components/theme";
import { DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { ServerStatusProvider } from "@/hooks/use-server-status";
import { hasServer, watchSession, type AppSession } from "@/lib/backend";

const stackScreens = [
  ["tasks", "Tasks"],
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

// Drift chrome for the screens opened from More: dark header, light title, lime back button.
const headerOptions = {
  headerShown: true,
  headerLargeTitle: true,
  headerBackButtonDisplayMode: "minimal",
  headerTintColor: colors.accent,
  headerStyle: { backgroundColor: colors.shell },
  headerLargeStyle: { backgroundColor: colors.shell },
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerTitleStyle: { color: colors.onShell, fontFamily: fonts.bold },
  headerLargeTitleStyle: { color: colors.onShell, fontFamily: fonts.bold },
  headerBackTitleStyle: { fontFamily: fonts.medium }
} as const;

export default function RootLayout() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  // If a font fails to load, carry on with the system font rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: SpaceGrotesk_400Regular,
    [fonts.medium]: SpaceGrotesk_500Medium,
    [fonts.semibold]: SpaceGrotesk_600SemiBold,
    [fonts.bold]: SpaceGrotesk_700Bold,
    ...Feather.font
  });

  useEffect(() => (configured ? watchSession(setSession) : undefined), []);

  if (!configured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.shell }}>
        <Text style={{ color: colors.onShell }}>Add EXPO_PUBLIC_API_URL (Orbit's server) to .env.local, then restart.</Text>
      </View>
    );
  }

  if (session === undefined || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.shell }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.shell } }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        {stackScreens.map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ ...headerOptions, title }} />
        ))}
        <Stack.Screen name="capture" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.shell } }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );

  return (
    <>
      <StatusBar style="light" />
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
