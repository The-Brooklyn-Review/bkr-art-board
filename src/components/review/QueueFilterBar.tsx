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
import { Menu, MenuCheckbox, MenuDivider, MenuLink } from "@/components/review/Menu";

const MINE_OPTIONS = [
  ["any", "Any", "Any"],
  ["todo", "Not decided by me yet", "Not yet"],
  ["done", "Decided by me", "Decided"],
] as const;

/**
 * Two tiers in one row (wrapping on narrow screens):
 *   status — the primary split, always visible with counts;
 *   Assigned / My decision / Labels — menus that show their current value;
 *   search — fills what's left.
 * Same control vocabulary as the gallery's filter row.
 */
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
    const t = setTimeout(() => router.replace(href({ q }), { scroll: false }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- href is derived from filters
  }, [q]);

  // Picking several labels in a row: each click must build on the last,
  // not on the URL that hasn't caught up yet — so hold the selection here
  // until the server render reflects it.
  const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
  if (pendingLabels && pendingLabels.join() === filters.labels.join()) setPendingLabels(null);
  const selectedLabels = pendingLabels ?? filters.labels;
  const toggleLabel = (id: string) => {
    const next = selectedLabels.includes(id)
      ? selectedLabels.filter((l) => l !== id)
      : [...selectedLabels, id];
    setPendingLabels(next);
    router.replace(href({ labels: next }), { scroll: false });
  };

  const assigned = filters.assigned === currentReviewerId ? "me" : filters.assigned;
  const others = reviewers.filter((r) => r.id !== currentReviewerId);
  const assignedLabel =
    assigned === "me"
      ? "Me"
      : assigned === "all"
        ? "Everyone"
        : assigned === "unassigned"
          ? "No one"
          : (others.find((r) => r.id === assigned)?.name ?? "Reviewer");
  const mineLabel = MINE_OPTIONS.find(([v]) => v === filters.mine)![2];
  const labelName = (id: string) => labels.find((l) => l.submittableLabelId === id)?.name ?? "?";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Status: the primary split. Scrolls sideways on a phone rather than wrapping. */}
        <div className="w-full sm:w-auto -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
          <div className="flex w-max border border-border" role="group" aria-label="Status">
            {STATUS_GROUPS.map((g) => {
              const on = filters.status === g.value;
              return (
                <Link
                  key={g.value}
                  href={href({ status: g.value })}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={`text-xs px-3 py-1.5 border-r border-border last:border-r-0 whitespace-nowrap transition-colors ${
                    on
                      ? "bg-surface text-text shadow-[inset_0_-2px_0_var(--color-accent)]"
                      : "text-text-muted hover:text-text hover:bg-bg-hover"
                  }`}
                >
                  {g.label}
                  <span
                    className={`ml-1.5 tabular-nums ${on ? "text-text-muted" : "text-text-muted/70"}`}
                  >
                    {statusCounts[g.value]}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <span aria-hidden className="hidden sm:block w-px h-5 bg-border mx-1" />

        <Menu
          active={assigned !== DEFAULT_FILTERS.assigned}
          label={
            <span className="truncate max-w-48">
              <span className="text-text-muted">Assigned:</span>{" "}
              <span className="text-text">{assignedLabel}</span>
            </span>
          }
        >
          <MenuLink href={href({ assigned: "me" })} selected={assigned === "me"}>
            Me
          </MenuLink>
          {others.map((r) => (
            <MenuLink key={r.id} href={href({ assigned: r.id })} selected={assigned === r.id}>
              {r.name}
            </MenuLink>
          ))}
          <MenuDivider />
          <MenuLink href={href({ assigned: "all" })} selected={assigned === "all"}>
            Everyone
          </MenuLink>
          <MenuLink href={href({ assigned: "unassigned" })} selected={assigned === "unassigned"}>
            No one (unassigned)
          </MenuLink>
        </Menu>

        <Menu
          active={filters.mine !== DEFAULT_FILTERS.mine}
          label={
            <span>
              <span className="text-text-muted">My decision:</span>{" "}
              <span className="text-text">{mineLabel}</span>
            </span>
          }
        >
          {MINE_OPTIONS.map(([v, label]) => (
            <MenuLink key={v} href={href({ mine: v })} selected={filters.mine === v}>
              {label}
            </MenuLink>
          ))}
        </Menu>

        <Menu
          active={selectedLabels.length > 0}
          panelClassName="w-56"
          label={
            <span>
              <span className={selectedLabels.length ? "text-text" : ""}>Labels</span>
              {selectedLabels.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 bg-accent text-bg text-[10px] tabular-nums">
                  {selectedLabels.length}
                </span>
              )}
            </span>
          }
        >
          {labels.map((l) => (
            <MenuCheckbox
              key={l.submittableLabelId}
              checked={selectedLabels.includes(l.submittableLabelId)}
              onToggle={() => toggleLabel(l.submittableLabelId)}
            >
              {l.name}
            </MenuCheckbox>
          ))}
          {selectedLabels.length > 0 && (
            <>
              <MenuDivider />
              <MenuLink href={href({ labels: [] })}>Clear labels</MenuLink>
            </>
          )}
        </Menu>

        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-56">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search artist or title"
            aria-label="Search artist or title"
            className="w-full bg-surface border border-border text-sm text-text px-3 py-1.5 outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {(filters.labels.length > 0 || !isDefaultFilters(filters)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {filters.labels.map((id) => (
            <Link
              key={id}
              href={href({ labels: filters.labels.filter((l) => l !== id) })}
              scroll={false}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent text-bg hover:opacity-85"
              aria-label={`Remove label filter ${labelName(id)}`}
            >
              {labelName(id)} <span aria-hidden>×</span>
            </Link>
          ))}
          {!isDefaultFilters(filters) && (
            <Link
              href={`/submissions${filtersToQuery(DEFAULT_FILTERS)}`}
              scroll={false}
              className="text-text-muted underline hover:text-text ml-1"
            >
              Reset to my queue
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
