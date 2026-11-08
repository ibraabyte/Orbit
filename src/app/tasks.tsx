import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip, Chips } from "@/components/chips";
import { Card, CountBadge, EmptyState, RowButton, StatGrid, StatTile } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Input, openCapture, Screen } from "@/components/screen";
import { TaskRow } from "@/components/task-row";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useTaskActions } from "@/hooks/use-task-actions";
import { formatNumber, isArabic, t } from "@/lib/i18n";
import { groupByDay, inList, sortLists, type ListFilter } from "@/lib/tasks";
import type { TaskList } from "@/lib/types";

// Open tasks by day (overdue, today, tomorrow, later, no date), with the lists (Home, Work) as a filter on top.
// Long-press a list to rename or delete it.
export default function Tasks() {
  const { data, loading, refresh } = useDashboardData();
  const { sheet } = useOverlays();
  const actions = useTaskActions();
  const [filter, setFilter] = useState<ListFilter>("all");
  // The list being named: "new" for a new one, or the list being renamed.
  const [naming, setNaming] = useState<"new" | TaskList | null>(null);
  const [name, setName] = useState("");

  const lists = useMemo(() => sortLists(data.taskLists), [data.taskLists]);
  const open = useMemo(() => data.tasks.filter((task) => task.status === "open"), [data.tasks]);
  // A list that was deleted elsewhere falls back to All.
  const active: ListFilter = filter === "all" || filter === "none" || lists.some((list) => list.id === filter) ? filter : "all";
  const shown = useMemo(() => inList(open, active), [open, active]);
  const groups = useMemo(() => groupByDay(shown), [shown]);
  const count = (key: ListFilter) => inList(open, key).length;
  const overdue = groups.find((group) => group.group === "overdue")?.tasks.length ?? 0;
  const today = groups.find((group) => group.group === "today")?.tasks.length ?? 0;
  const scheduled = data.reminders.filter((reminder) => reminder.status === "scheduled").length;
  const hasLoose = lists.length > 0 && open.some((task) => !task.list_id);

  const startNaming = (target: "new" | TaskList) => {
    setNaming(target);
    setName(target === "new" ? "" : target.name);
  };

  const saveName = async () => {
    if (naming === "new") {
      const created = await actions.createList(name);
      if (created) setFilter(created.id);
      if (created || !name.trim()) setNaming(null);
    } else if (naming && (await actions.renameList(naming, name))) {
      setNaming(null);
    }
  };

  const listMenu = (id: string) => {
    const list = lists.find((item) => item.id === id);
    if (!list) return;
    sheet({
      title: list.name,
      options: [
        { label: `✎ ${t.renameList}`, run: () => startNaming(list) },
        { label: `✕ ${t.deleteList}`, destructive: true, run: () => actions.removeList(list, () => setFilter("all")) }
      ]
    });
  };

  const filters: ListFilter[] = ["all", ...lists.map((list) => list.id), ...(hasLoose ? ["none"] : [])];
  const filterLabel = (key: ListFilter) => {
    const label = key === "all" ? t.allLists : key === "none" ? t.noList : (lists.find((list) => list.id === key)?.name ?? "");
    return `${label} ${formatNumber(count(key))}`;
  };

  return (
    <Screen stackAction={{ label: t.capture, onPress: () => openCapture() }} refreshing={loading} onRefresh={refresh}>
      <Chips options={filters} value={active} onChange={setFilter} label={filterLabel} onLongPress={(key) => key !== "all" && key !== "none" && listMenu(key)}>
        <Chip label={`+ ${t.newList}`} onPress={() => startNaming("new")} />
      </Chips>

      {naming ? (
        <View style={styles.naming}>
          <Input value={name} onChangeText={setName} placeholder={t.listNamePh} maxLength={60} autoFocus returnKeyType="done" onSubmitEditing={() => void saveName()} style={{ flex: 1 }} />
          <RowButton label={t.save} onPress={() => void saveName()} />
          <RowButton label={t.cancel} outline onPress={() => setNaming(null)} />
        </View>
      ) : null}

      <StatGrid>
        {[
          <StatTile key="open" label={t.openTasks} value={shown.length} />,
          <StatTile key="overdue" label={t.overdue} value={overdue} alert={overdue > 0} />,
          <StatTile key="today" label={t.dueToday} value={today} />,
          <StatTile key="scheduled" label={t.scheduled} value={scheduled} />
        ]}
      </StatGrid>

      {groups.map(({ group, tasks }) => (
        <Card key={group} title={t.dayGroups[group]} action={<CountBadge value={tasks.length} alert={group === "overdue"} />}>
          {tasks.map((task, index) => (
            <TaskRow key={task.id} task={task} first={index === 0} showPriority showList={active === "all"} grouped timeOnly={group === "today" || group === "tomorrow"} />
          ))}
        </Card>
      ))}

      {!groups.length ? (
        <Card>
          <EmptyState icon="check-circle" example={active === "all" ? (isArabic ? "مهمة ادفع الإيجار الخميس +البيت" : "pay rent fri 5pm +home") : undefined} action={{ label: t.add, onPress: () => openCapture() }}>
            {active === "all" ? t.tasksEmpty : t.listEmpty}
          </EmptyState>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  naming: { flexDirection: "row", alignItems: "center", gap: 8 }
});
