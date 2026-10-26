import { Row, Screen } from "@/components/screen";

const sections = [
  ["/health", "Health", "Calories, macros, workouts, sleep, weight"],
  ["/food", "Food", "Meal plans and groceries"],
  ["/finance", "Finance", "Spending and bills"],
  ["/people", "People", "Follow-ups and birthdays"],
  ["/habits", "Habits", "Daily and weekly check-ins"],
  ["/goals", "Goals", "Goals and milestones"],
  ["/journal", "Journal", "Entries and mood"],
  ["/library", "Library", "Saved links and notes"],
  ["/settings", "Settings", "Face ID and account"]
] as const;

export default function More() {
  return (
    <Screen title="More">
      {sections.map(([href, title, detail]) => (
        <Row key={href} title={title} detail={detail} href={href} />
      ))}
    </Screen>
  );
}
