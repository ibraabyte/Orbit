"use client";

import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { FoodPanel } from "@/components/food-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function FoodPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Food" subtitle="Plan meals and keep the grocery queue close to health logs.">
        <Link className="button" href="/health">
          <Dumbbell size={16} aria-hidden="true" />
          Health
        </Link>
      </PageHeader>
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? (
        <FoodPanel
          userId={user.id}
          mealPlans={data.mealPlans}
          groceryItems={data.groceryItems}
          tags={data.tags}
          taggings={data.taggings}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
