import { Row, Screen } from "@/components/screen";

const sections = [
  ["/health", "Health", "Calories, macros, workouts, sleep, weight"],
  ["/whoop", "WHOOP", "Recovery, sleep, strain, with a written summary"],
  ["/food", "Food", "Meal plans and groceries"],
  ["/finance", "Finance", "Spending and bills"],
  ["/people", "People", "Follow-ups and birthdays"],
  ["/habits", "Habits", "Daily and weekly check-ins"],
  ["/goals", "Goals", "Goals and milestones"],
  ["/journal", "Journal", "Entries and mood"],
  ["/library", "Library", "Saved links and notes"],
  ["/vehicles", "Car", "Istimara, insurance, فحص, oil change"],
  ["/media", "Movies & TV", "Watch list, search and request on Seerr"],
  ["/servers", "Servers", "Up or down, with alerts"],
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
