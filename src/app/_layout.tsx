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
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";
import * as Updates from "expo-updates";
import { Appearance, AppState, DevSettings, Text, View } from "react-native";
import { AppLock } from "@/components/app-lock";
import { OverlayProvider } from "@/components/overlays";
import { SectionOffCover } from "@/components/section-off";
import { Loading, stackTitle } from "@/components/screen";
import { SidebarLayout } from "@/components/sidebar";
import { colors, fonts, scheme, space, usePalette, useScheme } from "@/components/theme";
import { clearDashboardCache, DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { ReminderNotifications } from "@/hooks/use-reminder-notifications";
import { clearWidget } from "@/hooks/use-widget-sync";
import { hasServer, watchSession, type AppSession } from "@/lib/backend";
import { t } from "@/lib/i18n";

const configured = hasServer();
// Sharing into Orbit needs the native share extension, which Expo Go doesn't have.
const shareDisabled = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// A widget tap can open Capture from closed; Today must be underneath for it to close back to.
export const unstable_settings = { anchor: "(tabs)" };

// Stack screens use the native header: the system back button and swipe, the title from src/components/screen.tsx.
// On iOS it floats over the content (Liquid Glass on iOS 26, which the screen's ScrollView insets under); Android has a
// solid bar in the ground colour.
const nativeHeader = {
  headerShown: true,
  headerTransparent: process.env.EXPO_OS === "ios",
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerStyle: process.env.EXPO_OS === "ios" ? undefined : { backgroundColor: colors.shell },
  headerLargeStyle: { backgroundColor: "transparent" },
  headerTintColor: colors.link,
  headerTitleStyle: { fontFamily: fonts.semibold, color: colors.onShell },
  headerLargeTitleStyle: { fontFamily: fonts.bold, color: colors.onShell },
  headerBackButtonDisplayMode: "minimal"
} as const;

// Sections opened from More get a large title that shrinks into the bar as you scroll. Screens one step further in
// (one task, a form, a picker) keep the small title.
const sectionScreens = ["accounts", "ask", "cards", "finance", "investments", "obligations", "subscriptions", "food", "habits", "health", "integrations", "library", "notifications", "media", "discover", "requests", "sections", "settings", "tasks", "vehicles", "whoop", "exercises/index", "gym", "injuries", "week", "training", "body", "plan", "medications", "phone-calls", "documents"];
const detailScreens = ["day-plan", "saved/[id]", "ai-provider", "ai-features", "health-goals", "person", "collection", "credits", "task/[id]", "exercises/[id]", "workout", "plan-day", "phone-call"];
// Self-contained tasks (add a food, pick an exercise, edit a medication) open as a sheet over what you were doing, with
// Cancel in its header and swipe-down to close; on Android they push as before.
const sheetScreens = ["food-add", "food-photo", "food-scan", "workout-pick", "plan-setup", "medication-edit", "document-edit"];
const sheetHeader = {
  presentation: "modal",
  ...(process.env.EXPO_OS === "ios" && {
    unstable_headerLeftItems: () => [{ type: "button" as const, label: t.cancel, onPress: () => router.back() }]
  })
} as const;
// Screens with a search field under the large title. It is set here so the header has it from the first frame (added
// later by the screen, the content would be laid out for a header without it); the screen fills in what it does.
const searchScreens = ["library", "media", "exercises/index"];
const headerSearch = { placement: "stacked", hideWhenScrolling: false } as const;
const routePath = (name: string) => "/" + name.replace(/\/?index$/, "");

export default function RootLayout() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  // The native header and back button read light or dark from the navigation theme, so it follows the phone's setting.
  const palette = usePalette();
  const dark = useScheme() === "dark";
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, dark, colors: { ...base.colors, primary: palette.link, background: palette.shell, card: palette.shell, text: palette.onShell, border: palette.hairline } };
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

  // On iOS colours follow a light/dark change live (see theme.ts). Android styles keep the launch palette, so a new
  // setting reloads the app when it comes back to the front. Only while active: the setting can flip in the background
  // while the system takes snapshots.
  useEffect(() => {
    if (process.env.EXPO_OS !== "android") return;
    const check = () => {
      if (AppState.currentState !== "active" || (Appearance.getColorScheme() === "light" ? "light" : "dark") === scheme) return;
      if (__DEV__ && typeof DevSettings.reload === "function") return DevSettings.reload();
      void Updates.reloadAsync().catch(() => undefined);
    };
    const subscriptions = [AppState.addEventListener("change", check), Appearance.addChangeListener(check)];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

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
      <View style={{ flex: 1, justifyContent: "center", padding: space.xxl, backgroundColor: colors.shell }}>
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
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.shell } }}>
        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="capture" options={{ presentation: "formSheet", sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: colors.sheet } }} />
          <Stack.Screen name="customize-today" options={{ presentation: "formSheet", sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: colors.sheet } }} />
          <Stack.Screen name="call" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        </Stack.Protected>
        {/* Every screen that reads account data: signed out they have no provider, so they must not be reachable. */}
        <Stack.Protected guard={Boolean(session)}>
          {sectionScreens.map((name) => (
            <Stack.Screen key={name} name={name} options={{ ...nativeHeader, headerLargeTitleEnabled: true, title: stackTitle(routePath(name)) ?? "", ...(searchScreens.includes(name) && { headerSearchBarOptions: headerSearch }) }} />
          ))}
          {detailScreens.map((name) => (
            <Stack.Screen key={name} name={name} options={{ ...nativeHeader, title: stackTitle(routePath(name)) ?? "" }} />
          ))}
          {sheetScreens.map((name) => (
            <Stack.Screen key={name} name={name} options={{ ...nativeHeader, ...sheetHeader, title: stackTitle(routePath(name)) ?? "" }} />
          ))}
          {/* A film or show: the header sits clear over the backdrop, with only the back button. */}
          <Stack.Screen name="title" options={{ ...nativeHeader, headerTransparent: true, title: "" }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );

  return (
    // Gesture Handler needs one root view around the app (swipe to complete a task).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ShareIntentProvider options={{ disabled: shareDisabled, resetOnBackground: true }}>
        <StatusBar style="auto" />
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
    </GestureHandlerRootView>
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
