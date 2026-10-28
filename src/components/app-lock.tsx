import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Button, StyleSheet, Text, View } from "react-native";

const LOCK_KEY = "orbit.app-lock";

export async function isAppLockEnabled() {
  return (await SecureStore.getItemAsync(LOCK_KEY)) !== "off";
}

export async function setAppLockEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(LOCK_KEY, enabled ? "on" : "off");
}

// Locks behind Face ID / passcode on launch and whenever the app returns from the background.
// While the app is in the app switcher the content is covered, so the snapshot shows nothing private.
export function AppLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(true);
  const [covered, setCovered] = useState(false);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const enrolled = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!(await isAppLockEnabled()) || !enrolled) {
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Orbit" });
      if (result.success) setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    void unlock();
    let wasBackground = false;
    const subscription = AppState.addEventListener("change", (state) => {
      setCovered(state !== "active");
      if (state === "background") {
        wasBackground = true;
        setLocked(true);
      }
      // The Face ID sheet itself makes the app "inactive", so only re-prompt after a real background.
      if (state === "active" && wasBackground) {
        wasBackground = false;
        void unlock();
      }
    });
    return () => subscription.remove();
  }, [unlock]);

  // Cover the app instead of unmounting it, so the open screen and anything typed survive a lock.
  const hidden = locked || covered;
  return (
    <View style={styles.fill}>
      <View style={styles.fill} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}>
        {children}
      </View>
      {hidden ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          <Text style={styles.title}>Orbit</Text>
          {locked && !covered ? <Button title="Unlock" onPress={unlock} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#f2f2f7" },
  title: { fontSize: 34, fontWeight: "700", color: "#111" }
});
