import type { Goal, GoalMilestone } from "@/lib/types";

export function milestonesForGoal(goalId: string, milestones: GoalMilestone[]) {
  return milestones.filter((milestone) => milestone.goal_id === goalId);
}

export function goalProgress(goal: Goal, milestones: GoalMilestone[]) {
  const goalMilestones = milestonesForGoal(goal.id, milestones);
  const completed = goalMilestones.filter((milestone) => milestone.completed_at).length;
  const total = goalMilestones.length;

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : goal.status === "completed" ? 100 : 0
  };
}

export function activeGoals(goals: Goal[]) {
  return goals.filter((goal) => goal.status === "active");
}

export function completedGoals(goals: Goal[]) {
  return goals.filter((goal) => goal.status === "completed");
}
