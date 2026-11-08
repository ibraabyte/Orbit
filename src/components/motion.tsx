import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

// Light motion, kept small on purpose: a short fade and lift when something appears, a little pop on a check.
// Nothing moves when the person has turned on Reduce Motion.

/** True when the system asks for less motion (iOS Reduce Motion, Android "Remove animations"). */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    try {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => alive && setReduce(value))
        .catch(() => undefined);
    } catch {
      // Not available (web preview): keep the motion.
    }
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, []);
  return reduce;
}

/** Fades in and rises a few points when it first shows (an opened card, a list that just appeared). */
export function FadeIn({ children, style, delay = 0, distance = 6 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; distance?: number }) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(progress, { toValue: 1, duration: 220, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [progress, delay]);
  if (reduce) return <Animated.View style={style}>{children}</Animated.View>;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** A quick squeeze and spring back, for a check that was just ticked. Returns the scale to put on a transform. */
export function usePop() {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const pop = () => {
    if (reduce) return;
    scale.setValue(0.82);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
  };
  return { scale, pop };
}
