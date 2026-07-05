"use client";

import { PageHeader } from "@/components/page-header";
import { TaskManager } from "@/components/task-manager";
import { LoadingBlock } from "@/components/loading-block";
import { useAuth } from "@/components/auth-provider";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { isToday } from "@/lib/dates";

export function TasksPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  if (!user) return null;

  const openTasks = data.tasks.filter((task) => task.status === "open");
  const highPriority = openTasks.filter((task) => task.priority === "high").length;
  const datedToday = openTasks.filter((task) => task.due_at && isToday(task.due_at)).length;
  const scheduledCount = data.reminders.filter((reminder) => reminder.status === "scheduled").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Tasks" subtitle="Create tasks, schedule reminders, and clear what is done." />
      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {!loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Open" value={openTasks.length} hint="tasks not done yet" />
            <StatTile label="High priority" value={highPriority} hint="items to protect" tone={highPriority ? "urgent" : "neutral"} />
            <StatTile label="Today" value={datedToday} hint="due on today’s calendar" />
            <StatTile label="Reminders" value={scheduledCount} hint="scheduled nudges" />
          </div>
          <TaskManager userId={user.id} tasks={data.tasks} reminders={data.reminders} tags={data.tags} taggings={data.taggings} onChanged={refresh} />
        </div>
      ) : null}
    </div>
  );
}
