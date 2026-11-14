import * as Haptics from "expo-haptics";
import { useRef, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors, fonts, labelCase, space, textSize } from "@/components/theme";
import { t } from "@/lib/i18n";

const THRESHOLD = 88;

// Swipe a row sideways (either way) past the threshold to complete it; a short drag springs back. The drag runs on the
// UI thread (Gesture Handler + Reanimated) and only starts on a clearly sideways move, so the list still scrolls. The row
// stays tappable, and VoiceOver gets a "Complete" action instead of the swipe.
export function SwipeToDone({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const x = useSharedValue(0);
  const done = useRef(onDone);
  done.current = onDone;

  const tick = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  const finish = () => {
    done.current();
    x.value = 0;
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      x.value = event.translationX;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) < THRESHOLD) {
        x.value = withSpring(0, { duration: 350, dampingRatio: 0.9 });
        return;
      }
      scheduleOnRN(tick);
      x.value = withTiming(Math.sign(event.translationX) * 480, { duration: 160 }, (finished) => {
        if (finished) scheduleOnRN(finish);
      });
    })
    .onFinalize((_, success) => {
      if (!success) x.value = withSpring(0, { duration: 350, dampingRatio: 0.9 });
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View>
      <View style={[StyleSheet.absoluteFill, styles.behind]} importantForAccessibility="no-hide-descendants">
        <Text style={styles.behindText}>✓ {t.done}</Text>
        <Text style={styles.behindText}>✓ {t.done}</Text>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityActions={[{ name: "complete", label: t.complete }]}
          onAccessibilityAction={(event) => event.nativeEvent.actionName === "complete" && onDone()}
          accessibilityHint={t.swipeDone}
          style={[{ backgroundColor: colors.surface }, slide]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm },
  behindText: { fontFamily: fonts.medium, fontSize: textSize.caption2, color: colors.link, ...labelCase }
});
