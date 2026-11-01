import { Text, View } from "react-native";
import { IconTile, ListRow, Stack, type, type IconName } from "@/components/drift";
import { Screen } from "@/components/screen";
import type { Href } from "expo-router";

// The web's More page: everything else in Orbit, grouped, each with an icon.
const groups: { label: string; items: [href: Href, title: string, detail: string, icon: IconName][] }[] = [
  {
    label: "Run the day",
    items: [["/tasks", "Tasks", "Open tasks, due dates, done", "check-square"]]
  },
  {
    label: "Life records",
    items: [
      ["/health", "Health", "Calories, macros, workouts, sleep, weight", "activity"],
      ["/whoop", "WHOOP", "Recovery, sleep, strain, with a written summary", "watch"],
      ["/food", "Food", "Meal plans and groceries", "coffee"],
      ["/finance", "Finance", "Spending and bills", "credit-card"],
      ["/people", "People", "Follow-ups and birthdays", "users"],
      ["/habits", "Habits", "Daily and weekly check-ins", "repeat"],
      ["/goals", "Goals", "Goals and milestones", "flag"],
      ["/journal", "Journal", "Entries and mood", "book-open"],
      ["/library", "Library", "Saved links and notes", "bookmark"]
    ]
  },
  {
    label: "Home & services",
    items: [
      ["/vehicles", "Car", "Istimara, insurance, فحص, oil change", "truck"],
      ["/media", "Movies & TV", "Watch list, search and request on Seerr", "film"],
      ["/servers", "Servers", "Up or down, with alerts", "server"]
    ]
  },
  {
    label: "System",
    items: [
      ["/integrations", "Integrations", "WHOOP, Seerr and AI, for your account", "link"],
      ["/settings", "Settings", "Face ID and account", "settings"]
    ]
  }
];

export default function More() {
  return (
    <Screen title="More" subtitle="Everything in Orbit">
      {groups.map((group) => (
        <View key={group.label} style={{ gap: 8 }}>
          <Text style={[type.shellLabel, { paddingHorizontal: 4 }]}>{group.label}</Text>
          <Stack>
            {group.items.map(([href, title, detail, icon]) => (
              <ListRow key={String(href)} href={href} leading={<IconTile name={icon} />} title={title} subtitle={detail} chevron />
            ))}
          </Stack>
        </View>
      ))}
    </Screen>
  );
}
