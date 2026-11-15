import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { useReduceMotion } from "@/components/motion";

// Same size and ground as the old native splash, so the hand-off is seamless.
const S = 120;
const H = S / 2;
const ground = "#0A0A0B";

/** Launch reveal: the Trail logo draws clockwise from its thin tail to its round head (1.3s), pulses once, then the
 * cover fades to show the app. Twin of assets/brand/night/orbit-logo-animation.html.
 * ponytail: no SVG library in the app, so the wipe is two ground-coloured half-discs that rotate away (a pie reveal);
 * it matches the ring mask because the logo is a ring around the centre. */
export function LaunchMark({ onDone }: { onDone: () => void }) {
  const reduce = useReduceMotion();
  const draw = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const out = Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true });
    const run = reduce
      ? Animated.sequence([Animated.timing(draw, { toValue: 1, duration: 0, useNativeDriver: true }), Animated.delay(400), out])
      : Animated.sequence([
          Animated.timing(draw, { toValue: 1, duration: 1300, easing: Easing.bezier(0.55, 0, 0.25, 1), useNativeDriver: true }),
          Animated.timing(pop, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          out
        ]);
    run.start(({ finished }) => finished && onDone());
    return () => run.stop();
  }, [reduce, draw, pop, fade, onDone]);

  // Right cover turns through the first half, then the left cover through the second.
  const right = draw.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "180deg", "180deg"] });
  const left = draw.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "0deg", "180deg"] });
  const scale = pop.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.04, 1] });

  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.screen, { opacity: fade }]}>
      <Animated.View style={{ width: S, height: S, transform: [{ scale }] }}>
        <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={styles.box} />
        {/* The wipe starts just behind the tail: 65° clockwise from the top. */}
        <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: "65deg" }] }]}>
          <View style={[styles.half, { left: H }]}>
            <Animated.View style={[styles.box, { left: -H, transform: [{ rotate: right }] }]}>
              <View style={[styles.cover, { left: H }]} />
            </Animated.View>
          </View>
          {/* 1pt wider so no hairline of logo shows where the halves meet. */}
          <View style={[styles.half, { left: 0, width: H + 1 }]}>
            <Animated.View style={[styles.box, { transform: [{ rotate: left }] }]}>
              <View style={[styles.cover, { left: 0, width: H + 1 }]} />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: ground, alignItems: "center", justifyContent: "center" },
  box: { position: "absolute", top: 0, width: S, height: S },
  half: { position: "absolute", top: 0, width: H, height: S, overflow: "hidden" },
  cover: { position: "absolute", top: 0, width: H, height: S, backgroundColor: ground }
});
