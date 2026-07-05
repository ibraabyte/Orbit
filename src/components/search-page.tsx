"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildSearchResults, searchResultLabels, searchResultTypes, type SearchTypeFilter } from "@/lib/search";

export function SearchPage() {
  const { user } = useAuth();
  const { data, loading, error } = useDashboardData(user?.id);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>("all");
  const results = useMemo(() => buildSearchResults(data, query, typeFilter), [data, query, typeFilter]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Search" subtitle="Find anything saved in Orbit." />
      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {!loading ? (
        <Card>
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search everything..." autoFocus aria-label="Search" className="pl-9" />
            </div>
            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as SearchTypeFilter)} aria-label="Search type">
              <option value="all">All types</option>
              {searchResultTypes.map((type) => (
                <option value={type} key={type}>
                  {searchResultLabels[type]}
                </option>
              ))}
            </Select>
          </div>
          {query.trim() && !results.length ? <div className="mt-3"><EmptyState>No matches found.</EmptyState></div> : null}
          {!query.trim() ? (
            <div className="mt-3">
              <EmptyState>Search tasks, people, captures, food plans, groceries, health logs, finance, habits, goals, and journal entries.</EmptyState>
            </div>
          ) : null}
          {results.length ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={result.href}
                  className="rounded-tile border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{result.title}</p>
                      <p className="text-[12.5px] text-ink-muted">{result.detail || result.type}</p>
                      {result.tags.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`${result.title} tags`}>
                          {result.tags.map((tag) => (
                            <Badge key={tag}>#{tag}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Badge>{result.type}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
