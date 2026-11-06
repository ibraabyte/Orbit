import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetProps } from "@/lib/widget-snapshot";

// Compiled to a string and run in the widget's own runtime, where Expo UI's components and modifiers are globals.
// ponytail: declared loosely because npm nests @expo/ui under expo-widgets, so it cannot be imported from here. Add @expo/ui as a direct dependency to get prop types.
declare const Text: any, VStack: any, HStack: any, Spacer: any, Image: any;
declare const font: any, foregroundStyle: any, frame: any, lineLimit: any, containerBackground: any, widgetURL: any, accessibilityLabel: any;

const TodayWidget = (props: WidgetProps, env: WidgetEnvironment) => {
  "widget";
  // Colours from theme.ts: the widget can't import it.
  const ink = "#ece9e2";
  const muted = "#8f8d87";
  const lime = "#e8c890"; // sand
  const side = props.rtl ? "trailing" : "leading";
  const line = (text: string, color: string, size: number, key: string) => (
    <Text key={key} modifiers={[font({ size }), foregroundStyle(color), lineLimit(1), frame({ maxWidth: Infinity, alignment: side })]}>
      {text}
    </Text>
  );
  const count = props.count ? [<Text key="count" modifiers={[font({ size: 30, weight: "bold" }), foregroundStyle(lime)]}>{props.count}</Text>] : [];
  const title = <Text key="title" modifiers={[font({ size: 14, weight: "semibold" }), foregroundStyle(ink)]}>{props.title}</Text>;
  const add = <Image key="add" systemName="plus.circle.fill" color={lime} size={26} modifiers={[accessibilityLabel(props.capture)]} />;
  // SwiftUI here stays left-to-right whatever the app's language, so Arabic is laid out by hand.
  const head = props.rtl ? [add, <Spacer key="gap" />, title, ...count] : [...count, title, <Spacer key="gap" />, add];
  const tasks = props.tasks.slice(0, env.widgetFamily === "systemSmall" ? 2 : 3);
  return (
    <VStack alignment={side} spacing={5} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: props.rtl ? "topTrailing" : "topLeading" }), containerBackground("#0a0a0b", "widget"), widgetURL("orbit://capture")]}>
      <HStack spacing={6}>{head}</HStack>
      {props.message ? line(props.message, muted, 13, "message") : null}
      {tasks.map((task, index) => line(task, ink, 13, `task-${index}`))}
      <Spacer />
      {props.prayer && props.prayerTime ? line(`${props.prayer} · ${props.prayerTime}`, muted, 12, "prayer") : null}
    </VStack>
  );
};

// Shown before the app has ever run, when the language isn't known yet.
export default createWidget<WidgetProps>("TodayWidget", TodayWidget, {
  rtl: false,
  title: "Orbit",
  capture: "Capture · التقاط",
  count: "",
  tasks: [],
  message: "Open Orbit · افتح Orbit",
  prayer: "",
  prayerTime: ""
});
