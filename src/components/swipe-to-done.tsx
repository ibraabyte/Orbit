import * as Haptics from "expo-haptics";
import { useMemo, useRef, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { colors, fonts, labelCase } from "@/components/theme";
import { t } from "@/lib/i18n";

const THRESHOLD = 88;

// Swipe a row sideways (either way) past the threshold to complete it; a short drag springs back. The row stays
// tappable, and VoiceOver gets a "Complete" action instead of the swipe.
export function SwipeToDone({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, move) => Math.abs(move.dx) > 12 && Math.abs(move.dx) > Math.abs(move.dy) * 2,
        onPanResponderMove: (_, move) => x.setValue(move.dx),
        onPanResponderRelease: (_, move) => {
          if (Math.abs(move.dx) < THRESHOLD) {
            Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          Animated.timing(x, { toValue: Math.sign(move.dx) * 480, duration: 160, useNativeDriver: true }).start(() => {
            done.current();
            x.setValue(0);
          });
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
      }),
    [x]
  );

  return (
    <View>
      <View style={[StyleSheet.absoluteFill, styles.behind]} importantForAccessibility="no-hide-descendants">
        <Text style={styles.behindText}>✓ {t.done}</Text>
        <Text style={styles.behindText}>✓ {t.done}</Text>
      </View>
      <Animated.View
        {...responder.panHandlers}
        accessibilityActions={[{ name: "complete", label: t.complete }]}
        onAccessibilityAction={(event) => event.nativeEvent.actionName === "complete" && onDone()}
        accessibilityHint={t.swipeDone}
        style={{ transform: [{ translateX: x }], backgroundColor: colors.surface }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  behindText: { fontFamily: fonts.medium, fontSize: 11, color: colors.accent, ...labelCase }
});
