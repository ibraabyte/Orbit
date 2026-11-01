import { Text } from "react-native";
import { Avatar, Badge, Card, EmptyState, Icon, IconTile, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { formatDate, t } from "@/lib/i18n";
import { markPersonContacted } from "@/lib/people-actions";
import { peopleSummary } from "@/lib/people";
import type { Person } from "@/lib/types";

export default function People() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast } = useOverlays();
  const people = peopleSummary(data);
  const followUps = [...people.overdueFollowUps, ...people.dueFollowUps.filter((person) => !people.overdueFollowUps.includes(person))];

  const contacted = (person: Person) => {
    const save = (days: number | null) => () => void act(() => markPersonContacted(getApi(), person.id, days)).then(() => toast(t.contacted));
    sheet({
      title: `${t.contacted} · ${person.name}`,
      detail: t.nextFollowUp,
      options: [
        { label: t.inAWeek, run: save(7) },
        { label: t.inAMonth, run: save(30) },
        { label: t.none, run: save(null) }
      ]
    });
  };

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Card title={t.dueFollowUps}>
        {followUps.length ? (
          followUps.map((person) => {
            const overdue = people.overdueFollowUps.includes(person);
            return (
              <ListRow
                key={person.id}
                leading={<Avatar name={person.name} dark />}
                title={person.name}
                titleExtra={person.relationship ? `· ${person.relationship}` : undefined}
                badges={overdue ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : <Badge tone="accent" glyph="◷">{t.dueToday}</Badge>}
                subtitle={person.last_contacted_at ? formatDate(person.last_contacted_at) : null}
                trailing={<RowButton label={t.contacted} onPress={() => contacted(person)} />}
              />
            );
          })
        ) : (
          <EmptyState example="person Faisal friend">{t.emptyEx}</EmptyState>
        )}
      </Card>
      <Card title={t.birthdays}>
        {people.upcomingBirthdays.length ? (
          people.upcomingBirthdays.map((event) => (
            <ListRow
              key={event.person.id}
              leading={<IconTile name="gift" size={28} tone="accent" />}
              title={event.person.name}
              trailing={
                <Text style={type.rowSubtitle}>
                  {formatDate(`${event.date}T12:00:00`)}
                  {event.age === null ? "" : ` · ${t.turns} `}
                  {event.age === null ? null : <Text style={type.barValue}>{event.age}</Text>}
                </Text>
              }
            />
          ))
        ) : (
          <EmptyState>{t.emptyEx}</EmptyState>
        )}
      </Card>
      <Card title={t.everyone}>
        {data.people.map((person) => (
          <ListRow key={person.id} leading={<Avatar name={person.name} size={32} />} title={person.name} subtitle={person.relationship} trailing={<Icon name="star" size={16} color={person.favorite ? colors.accentDeep : colors.hairline} />} onPress={() => contacted(person)} />
        ))}
        {!data.people.length ? <EmptyState example="person Sara sister">{t.emptyEx}</EmptyState> : null}
      </Card>
    </Screen>
  );
}
