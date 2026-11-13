import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import Feather from "@expo/vector-icons/Feather";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { OverlayProvider } from "@/components/overlays";
import { SectionOffCover } from "@/components/section-off";
import { Loading } from "@/components/screen";
import { SidebarLayout } from "@/components/sidebar";
import { colors } from "@/components/theme";
import { clearDashboardCache, DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { clearWidget } from "@/hooks/use-widget-sync";
import { hasServer, watchSession, type AppSession } from "@/lib/backend";

const configured = hasServer();
// Sharing into Orbit needs the native share extension, which Expo Go doesn't have.
const shareDisabled = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// A widget tap can open Capture from closed; Today must be underneath for it to close back to.
export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  // If a font fails to load, carry on with the system font rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    ...Feather.font
  });

  useEffect(() => (configured ? watchSession(setSession) : undefined), []);

  // Personal data shouldn't outlive the session on a shared phone, however it ended (sign-out, expiry, or a session
  // that failed to restore at launch): the widget, the saved "orbit.cache." copies, and scheduled alarms, which carry titles.
  useEffect(() => {
    if (session !== null) return;
    clearWidget();
    void clearDashboardCache().catch(() => undefined);
    void Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  }, [session]);

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
        <Stack.Screen name="capture" options={{ presentation: "formSheet", sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: "rgba(10,10,11,0.86)" } }} />
      </Stack.Protected>
      {/* Every screen that reads account data: signed out they have no provider, so they must not be reachable. */}
      <Stack.Protected guard={Boolean(session)}>
        {["accounts", "ask", "cards", "finance", "investments", "obligations", "food", "food-add", "food-photo", "food-scan", "habits", "health", "health-goals", "integrations", "library", "notifications", "media", "title", "discover", "requests", "person", "sections", "settings", "tasks", "task/[id]", "vehicles", "whoop", "exercises/index", "exercises/[id]", "gym", "injuries", "week", "training", "workout", "workout-pick", "body", "plan", "plan-day", "plan-setup"].map((name) => (
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
    <ShareIntentProvider options={{ disabled: shareDisabled, resetOnBackground: true }}>
      <StatusBar style="light" />
      {session ? (
        <AppLock>
          <DashboardDataProvider key={session.userId} userId={session.userId}>
            <OverlayProvider>
              <SidebarLayout>
                <View style={{ flex: 1 }}>
                  {stack}
                  {/* A switched-off section reached by an old link, widget or alert: say so instead of showing it. */}
                  <SectionOffCover />
                </View>
              </SidebarLayout>
            </OverlayProvider>
            {/* After the stack, so a notification tap that opened the app navigates once it's mounted. */}
            <ReminderNotifications />
            <SharedLinks />
          </DashboardDataProvider>
        </AppLock>
      ) : (
        stack
      )}
    </ShareIntentProvider>
  );
}

// Something shared from TikTok, X or any app: open the saver, which saves it.
function SharedLinks() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  useEffect(() => {
    if (hasShareIntent && pathname !== "/library") router.push("/library");
  }, [hasShareIntent, pathname]);
  return null;
}
