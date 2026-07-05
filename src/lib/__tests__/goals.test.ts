import { describe, expect, it } from "vitest";
import { activeGoals, completedGoals, goalProgress, milestonesForGoal } from "@/lib/goals";
import type { Goal, GoalMilestone } from "@/lib/types";

const active: Goal = {
  id: "goal-1",
  user_id: "user-1",
  title: "Cut to 80kg",
  notes: null,
  status: "active",
  target_at: "2026-09-01",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z"
};

const completed: Goal = {
  ...active,
  id: "goal-2",
  status: "completed"
};

const milestones: GoalMilestone[] = [
  {
    id: "milestone-1",
    user_id: "user-1",
    goal_id: "goal-1",
    title: "Plan meals",
    completed_at: "2026-07-02T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "milestone-2",
    user_id: "user-1",
    goal_id: "goal-1",
    title: "Train 4x",
    completed_at: null,
    created_at: "2026-07-01T00:00:00.000Z"
  }
];

describe("goals", () => {
  it("filters goals by status", () => {
    expect(activeGoals([active, completed])).toEqual([active]);
    expect(completedGoals([active, completed])).toEqual([completed]);
  });

  it("calculates milestone progress", () => {
    expect(milestonesForGoal("goal-1", milestones)).toEqual(milestones);
    expect(goalProgress(active, milestones)).toEqual({ completed: 1, total: 2, percent: 50 });
    expect(goalProgress(completed, [])).toEqual({ completed: 0, total: 0, percent: 100 });
  });
});
