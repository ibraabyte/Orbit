"use client";

import Link from "next/link";
import { Utensils } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { HealthPanel } from "@/components/health-panel";
import { LoadingBlock } from "@/components/loading-block";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function HealthPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Health" subtitle="Track meals, calories, weight, workouts, and sleep manually.">
        <Link className="button" href="/food">
          <Utensils size={16} aria-hidden="true" />
          Food plan
        </Link>
      </PageHeader>
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? (
        <HealthPanel
          userId={user.id}
          meals={data.meals}
          weightLogs={data.weightLogs}
          workouts={data.workouts}
          sleepLogs={data.sleepLogs}
          tags={data.tags}
          taggings={data.taggings}
          preferredWeightUnit={data.profile?.weight_unit ?? "kg"}
          dailyCalorieTarget={data.profile?.daily_calorie_target ?? null}
          dailyProteinTarget={data.profile?.daily_protein_target ?? null}
          dailyCarbsTarget={data.profile?.daily_carbs_target ?? null}
          dailyFatTarget={data.profile?.daily_fat_target ?? null}
          weeklyWorkoutTarget={data.profile?.weekly_workout_minutes_target ?? 150}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
