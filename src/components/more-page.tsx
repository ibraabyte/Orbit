"use client";

import { Bell, ChevronRight, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Badge } from "@/components/ui/badge";
import { navGroups } from "@/components/nav-config";
import { privacyShieldRequestEvent } from "@/lib/privacy-shield";

// Today and Plan already sit in the bottom nav; Momentum is its own tab.
const PRIMARY_TAB_HREFS = new Set(["/dashboard", "/plan"]);

export function MorePage() {
  function hideApp() {
    window.dispatchEvent(new Event(privacyShieldRequestEvent));
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="More" subtitle="Everything in Orbit" />

      {navGroups.map((group) => {
        const items = group.items.filter((item) => !PRIMARY_TAB_HREFS.has(item.href));
        if (items.length === 0) return null;
        return (
          <section key={group.label} className="flex flex-col gap-2">
            <h2 className="px-1 uppercase tracking-[0.04em] text-on-shell-muted" style={{ font: "var(--text-label)" }}>
              {group.label}
            </h2>
            <div className="flex flex-col gap-1.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <ListRow
                    key={item.href}
                    href={item.href}
                    leading={
                      <span className="grid h-9 w-9 place-items-center rounded-tile bg-surface-inset text-accent-deep">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                    }
                    title={item.label}
                    trailing={<ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <Card title="Device">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] text-ink">
              <Bell size={16} aria-hidden="true" />
              Web push
            </span>
            <Badge tone="success">Ready</Badge>
          </div>
          <button
            type="button"
            onClick={hideApp}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-surface-inset px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:bg-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep"
          >
            <EyeOff size={16} aria-hidden="true" />
            Hide app
          </button>
        </div>
      </Card>
    </div>
  );
}
