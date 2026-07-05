"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { ModuleCard } from "@/components/module-card";
import { buildOnboardingProgress } from "@/lib/onboarding";
import type { DashboardData } from "@/lib/types";

export function OnboardingPanel({ data }: { data: DashboardData }) {
  const progress = buildOnboardingProgress(data);

  return (
    <ModuleCard title="Orbit setup" kicker={`${progress.completeCount}/${progress.totalCount} complete`} className="onboarding-module">
      <progress className="progress-meter" aria-label="Setup progress" value={progress.percent} max={100}>
        {progress.percent}%
      </progress>
      <div className="list spaced-top">
        {progress.done ? (
          <div className="list-row">
            <div className="row-main">
              <p className="row-title">Core setup is complete</p>
              <p className="row-meta">You have enough data for Today, Plan, Calendar, Search, and Insights to be useful.</p>
            </div>
            <span className="badge success">
              <CheckCircle2 size={14} aria-hidden="true" />
              ready
            </span>
          </div>
        ) : (
          progress.nextSteps.map((step) => (
            <Link className="list-row" href={step.href} key={step.id}>
              <div className="row-main">
                <p className="row-title">{step.title}</p>
                <p className="row-meta">{step.detail}</p>
              </div>
              <span className="badge">
                <Circle size={14} aria-hidden="true" />
                start
              </span>
            </Link>
          ))
        )}
      </div>
    </ModuleCard>
  );
}
