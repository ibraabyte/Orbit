import { Alert } from "react-native";
import { QuickAddCard } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { markPersonContacted } from "@/lib/people-actions";
import { peopleSummary } from "@/lib/people";
import type { Person } from "@/lib/types";

export default function People() {
  const { data, loading, refresh, act } = useDashboardData();
  const people = peopleSummary(data);
  const followUps = [...people.overdueFollowUps, ...people.dueFollowUps.filter((person) => !people.overdueFollowUps.includes(person))];

  const contacted = (person: Person) =>
    Alert.alert(`Talked to ${person.name}`, "Next follow-up in", [
      { text: "1 week", onPress: () => act(() => markPersonContacted(getApi(), person.id, 7)) },
      { text: "1 month", onPress: () => act(() => markPersonContacted(getApi(), person.id, 30)) },
      { text: "No follow-up", onPress: () => act(() => markPersonContacted(getApi(), person.id, null)) },
      { text: "Cancel", style: "cancel" }
    ]);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "person Sara as friend birthday 1990-03-14".' />
      <Section title="Follow-ups">
        {followUps.length ? followUps.map((person) => <Row key={person.id} title={person.name} detail={`Due ${person.next_follow_up_at}`} tone={people.overdueFollowUps.includes(person) ? "warning" : "neutral"} right="Contacted" onPress={() => contacted(person)} />) : <Empty>No follow-ups this week.</Empty>}
      </Section>
      <Section title="Birthdays (30 days)">
        {people.upcomingBirthdays.length ? people.upcomingBirthdays.map((event) => <Row key={event.person.id} title={event.person.name} detail={event.date} right={event.age === null ? undefined : `${event.age}`} />) : <Empty>No birthdays coming up.</Empty>}
      </Section>
      <Section title={`Everyone (${people.total})`}>
        {data.people.map((person) => (
          <Row key={person.id} title={`${person.favorite ? "★ " : ""}${person.name}`} detail={person.relationship} onPress={() => contacted(person)} />
        ))}
      </Section>
    </Screen>
  );
}
