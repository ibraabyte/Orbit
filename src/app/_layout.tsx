import { Almarai_400Regular, Almarai_700Bold, Almarai_800ExtraBold } from "@expo-google-fonts/almarai";
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
import { Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { OverlayProvider } from "@/components/overlays";
import { Loading } from "@/components/screen";
import { colors } from "@/components/theme";
import { DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { ServerStatusProvider } from "@/hooks/use-server-status";
import { hasServer, watchSession, type AppSession } from "@/lib/backend";

const configured = hasServer();

export default function RootLayout() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  // If a font fails to load, carry on with the system font rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Almarai_400Regular,
    Almarai_700Bold,
    Almarai_800ExtraBold,
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
        <Loading />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.shell } }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="capture" options={{ presentation: "formSheet", sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: colors.shellTop } }} />
      </Stack.Protected>
      {/* Every screen that reads account data: signed out they have no provider, so they must not be reachable. */}
      <Stack.Protected guard={Boolean(session)}>
        {["finance", "food", "goals", "habits", "health", "integrations", "journal", "library", "media", "people", "servers", "settings", "tasks", "vehicles", "whoop"].map((name) => (
          <Stack.Screen key={name} name={name} />
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
      <StatusBar style="light" />
      {session ? (
        <AppLock>
          <DashboardDataProvider key={session.userId} userId={session.userId}>
            <ServerStatusProvider>
              <OverlayProvider>{stack}</OverlayProvider>
            </ServerStatusProvider>
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
