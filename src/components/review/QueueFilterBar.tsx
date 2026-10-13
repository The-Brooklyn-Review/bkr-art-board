"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUS_GROUPS, type StatusGroup } from "@/lib/submittable/statuses";
import {
  filtersToQuery,
  isDefaultFilters,
  DEFAULT_FILTERS,
  type QueueFilters,
} from "@/lib/submissions/filters";

export function QueueFilterBar({
  filters,
  statusCounts,
  reviewers,
  labels,
  currentReviewerId,
}: {
  filters: QueueFilters;
  statusCounts: Record<StatusGroup, number>;
  reviewers: { id: string; name: string }[];
  labels: { submittableLabelId: string; name: string }[];
  currentReviewerId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const href = (o: Partial<QueueFilters>) => `/submissions${filtersToQuery(filters, o)}`;

  // Debounced search — typing shouldn't fire a server render per keystroke.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(href({ q })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- href is derived from filters
  }, [q]);

  const segment = (active: boolean) =>
    `px-3 py-1.5 text-sm border-r border-border last:border-r-0 transition-colors whitespace-nowrap ${
      active ? "bg-surface text-text" : "text-text-muted hover:text-text"
    }`;

  const toggleLabel = (id: string) =>
    filters.labels.includes(id) ? filters.labels.filter((l) => l !== id) : [...filters.labels, id];

  const assignedValue = filters.assigned === currentReviewerId ? "me" : filters.assigned;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex border border-border overflow-x-auto scrollbar-hide"
          role="group"
          aria-label="Status"
        >
          {STATUS_GROUPS.map((g) => (
            <Link
              key={g.value}
              href={href({ status: g.value })}
              aria-current={filters.status === g.value ? "true" : undefined}
              className={segment(filters.status === g.value)}
            >
              {g.label}
              <span className="ml-1.5 text-text-muted tabular-nums">{statusCounts[g.value]}</span>
            </Link>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-text-muted">
          Assigned to
          <select
            value={assignedValue}
            onChange={(e) => router.push(href({ assigned: e.target.value }))}
            className="bg-surface border border-border text-text px-2 py-1.5 outline-none focus:border-accent"
          >
            <option value="me">Me</option>
            {reviewers
              .filter((r) => r.id !== currentReviewerId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            <option value="unassigned">No one</option>
            <option value="all">Anyone</option>
          </select>
        </label>

        <div className="flex border border-border" role="group" aria-label="My decision">
          {(
            [
              ["any", "All"],
              ["todo", "Not yet decided by me"],
              ["done", "Decided by me"],
            ] as const
          ).map(([v, label]) => (
            <Link key={v} href={href({ mine: v })} className={segment(filters.mine === v)}>
              {label}
            </Link>
          ))}
        </div>

        <div className="relative flex-1 min-w-48">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search artist or title"
            aria-label="Search artist or title"
            className="w-full bg-surface border border-border text-sm text-text px-3 py-1.5 outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Labels">
        {labels.map((l) => {
          const on = filters.labels.includes(l.submittableLabelId);
          return (
            <Link
              key={l.submittableLabelId}
              href={href({ labels: toggleLabel(l.submittableLabelId) })}
              aria-pressed={on}
              className={`text-xs px-2.5 py-1 border transition-colors ${
                on
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-text-muted hover:border-accent hover:text-text"
              }`}
            >
              {l.name}
            </Link>
          );
        })}
        {!isDefaultFilters(filters) && (
          <Link
            href={`/submissions${filtersToQuery(DEFAULT_FILTERS)}`}
            className="text-xs text-text-muted underline ml-2 hover:text-text"
          >
            Reset filters
          </Link>
        )}
      </div>
    </div>
  );
}
