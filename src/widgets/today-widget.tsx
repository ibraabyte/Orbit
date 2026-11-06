import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { WidgetProps, WidgetRow } from "@/lib/widget-snapshot";

// Compiled to a string and run in the widget's own runtime, where Expo UI's components and modifiers are globals.
// ponytail: declared loosely because npm nests @expo/ui under expo-widgets, so it cannot be imported from here. Add @expo/ui as a direct dependency to get prop types.
declare const Text: any, VStack: any, HStack: any, ZStack: any, Spacer: any, Image: any, Link: any, Rectangle: any, Circle: any;
declare const font: any, foregroundStyle: any, frame: any, lineLimit: any, containerBackground: any, widgetURL: any, accessibilityLabel: any, textCase: any, padding: any;

// The Today rail, small: a sand "now" line, then the next prayers and timed things on a time line, and the overdue count.
const TodayWidget = (props: WidgetProps, env: WidgetEnvironment) => {
  "widget";
  // Night colours from theme.ts: the widget can't import it.
  const ink = "#f2f0ea";
  const muted = "#8a8a90";
  const sand = "#e8c890";
  const hairline = "#2a2a2e";
  const black = "#0a0a0b";
  const rtl = props.rtl;
  const side = rtl ? "trailing" : "leading";
  const large = env.widgetFamily === "systemLarge";
  const small = env.widgetFamily === "systemSmall";
  const rowHeight = large ? 30 : 21;
  const rows = (props.rows ?? []).slice(0, large ? 7 : 3);
  // JetBrains Mono isn't in the widget, so the system's mono stands in for it.
  const mono = (size: number, weight?: string) => font({ size, weight: weight ?? "regular", design: "monospaced" });
  // SwiftUI here stays left-to-right whatever the app's language, so Arabic is laid out by hand.
  const order = (items: any[]) => (rtl ? [...items].reverse() : items);

  const timeCell = (text: string, color: string, key: string, bold?: boolean) => (
    <Text key={key} modifiers={[mono(small ? 10 : 11, bold ? "semibold" : "regular"), foregroundStyle(color), lineLimit(1), frame({ width: small ? 34 : 40, alignment: side })]}>
      {text}
    </Text>
  );
  // The rail itself: a hairline down every row, with a tick, a dot or nothing on it.
  const tickCell = (mark: "tick" | "dot" | "none", color: string, key: string) => (
    <ZStack key={key} modifiers={[frame({ width: 16, height: rowHeight })]}>
      <Rectangle modifiers={[foregroundStyle(hairline), frame({ width: 1, height: rowHeight })]} />
      {mark === "tick" ? <Rectangle modifiers={[foregroundStyle(color), frame({ width: 7, height: 1 })]} /> : null}
      {mark === "dot" ? <Circle modifiers={[foregroundStyle(color), frame({ width: 7, height: 7 })]} /> : null}
    </ZStack>
  );
  const label = (row: WidgetRow) => {
    const color = row.kind === "prayer" ? (row.next ? sand : muted) : row.kind === "day" ? muted : ink;
    const text = row.kind === "prayer" ? (rtl ? `${row.title} ▲` : `▲ ${row.title}`) : row.title;
    const mark = row.kind === "thing" ? [mono(row.next ? 13 : 12, row.next ? "semibold" : "regular")] : [mono(10, "medium"), textCase("uppercase")];
    const title = (
      <Text key="title" modifiers={[...mark, foregroundStyle(color), lineLimit(1), frame({ maxWidth: Infinity, alignment: side })]}>
        {text}
      </Text>
    );
    // The kind ("Task", "Meal") sits at the far end where there's room for it.
    const kind = !small && row.detail ? [<Text key="kind" modifiers={[mono(9), textCase("uppercase"), foregroundStyle(muted), lineLimit(1)]}>{row.detail}</Text>] : [];
    return order([title, ...kind]);
  };
  const railRow = (row: WidgetRow, index: number) => (
    <HStack key={`row-${index}`} spacing={0} modifiers={[frame({ maxWidth: Infinity, height: rowHeight })]}>
      {order([
        timeCell(row.time, row.kind === "prayer" && row.next ? sand : row.kind === "thing" ? ink : muted, "time"),
        tickCell(row.kind === "day" ? "none" : "tick", row.kind === "prayer" && row.next ? sand : "#4a4a4e", "tick"),
        <HStack key="label" spacing={6} modifiers={[padding({ leading: rtl ? 0 : 4, trailing: rtl ? 4 : 0 })]}>
          {label(row)}
        </HStack>
      ])}
    </HStack>
  );

  const header = (
    <HStack key="header" spacing={6} modifiers={[frame({ maxWidth: Infinity })]}>
      {order([
        <Text key="title" modifiers={[mono(small ? 10 : 11, "medium"), textCase("uppercase"), foregroundStyle(muted), lineLimit(1)]}>
          {props.title}
        </Text>,
        <Spacer key="gap" />,
        // Small widgets open one link only (the whole widget), so the + is for the bigger ones.
        small ? null : (
          <Link key="add" destination="orbit://capture" modifiers={[accessibilityLabel(props.capture)]}>
            <Image systemName="plus.circle.fill" color={sand} size={22} />
          </Link>
        )
      ])}
    </HStack>
  );

  const nowRow = (
    <HStack key="now" spacing={0} modifiers={[frame({ maxWidth: Infinity, height: rowHeight })]}>
      {order([timeCell(props.now, sand, "label", true), tickCell("dot", sand, "dot"), <Rectangle key="line" modifiers={[foregroundStyle(sand), frame({ maxWidth: Infinity, height: 1 })]} />])}
    </HStack>
  );

  const footer = props.overdue ? (
    <HStack key="overdue" spacing={6} modifiers={[frame({ maxWidth: Infinity })]}>
      {order([
        <Text key="label" modifiers={[mono(10, "medium"), textCase("uppercase"), foregroundStyle(muted), lineLimit(1)]}>
          {props.overdueLabel}
        </Text>,
        <Spacer key="gap" />,
        <Text key="count" modifiers={[mono(13, "semibold"), foregroundStyle(sand)]}>
          {props.overdue}
        </Text>
      ])}
    </HStack>
  ) : null;

  return (
    <VStack
      alignment={side}
      spacing={small ? 4 : 6}
      modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: rtl ? "topTrailing" : "topLeading" }), containerBackground(black, "widget"), widgetURL("orbit://")]}
    >
      {header}
      <VStack key="rail" alignment={side} spacing={0}>
        {nowRow}
        {rows.map(railRow)}
      </VStack>
      {props.message ? (
        <Text key="message" modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2), frame({ maxWidth: Infinity, alignment: side })]}>
          {props.message}
        </Text>
      ) : null}
      <Spacer key="end" />
      {footer}
    </VStack>
  );
};

// Shown before the app has ever run, when the language isn't known yet.
export default createWidget<WidgetProps>("TodayWidget", TodayWidget, {
  rtl: false,
  title: "Orbit",
  now: "Now",
  capture: "Capture · التقاط",
  rows: [],
  overdue: "",
  overdueLabel: "Off the rail",
  message: "Open Orbit · افتح Orbit"
});
