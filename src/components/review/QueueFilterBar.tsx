"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUS_GROUPS, type StatusGroup } from "@/lib/submittable/statuses";
import {
  DECISION_FILTERS,
  filtersToQuery,
  isDefaultFilters,
  DEFAULT_FILTERS,
  type QueueFilters,
} from "@/lib/submissions/filters";
import { Menu, MenuCheckbox, MenuDivider, MenuHeading, MenuLink } from "@/components/review/Menu";
import { useScrollToTopOnChange } from "@/lib/ui/useScrollToTopOnChange";

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
  // Every filter change navigates with scroll={false} (so menus and the
  // search box don't jump), which kept the old scroll position in the new
  // results; this takes the list back to the top instead.
  useScrollToTopOnChange(filtersToQuery(filters));
  const [q, setQ] = useState(filters.q);
  const href = (o: Partial<QueueFilters>) => `/submissions${filtersToQuery(filters, o)}`;

  // The page stays mounted when only the URL's query changes, so a search
  // changed from outside this box ("Reset to my queue", Back) must be copied
  // in — but not the one this box just sent, which would overwrite whatever
  // was typed since.
  const [seenQ, setSeenQ] = useState(filters.q);
  const [sentQ, setSentQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (filters.q !== sentQ) {
      setQ(filters.q);
      setSentQ(filters.q);
    }
  }

  // Debounced search — typing shouldn't fire a server render per keystroke.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => {
      setSentQ(q);
      router.replace(href({ q }), { scroll: false });
    }, 300);
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
  const decisionLabel = DECISION_FILTERS.find(([v]) => v === filters.decision)![1];
  // Whose decisions the filter reads follows Assigned (see decisionsOf).
  const whoseDecision =
    assigned === "me"
      ? "Your decision"
      : assigned === "all" || assigned === "unassigned"
        ? "Anyone’s decision"
        : `${assignedLabel}’s decision`;
  const labelName = (id: string) => labels.find((l) => l.submittableLabelId === id)?.name ?? "?";

  // In the phone's combined sheet, picking one option shouldn't close it.
  const assignedItems = (keepOpen: boolean) => (
    <>
      <MenuLink href={href({ assigned: "me" })} selected={assigned === "me"} keepOpen={keepOpen}>
        Me
      </MenuLink>
      {others.map((r) => (
        <MenuLink
          key={r.id}
          href={href({ assigned: r.id })}
          selected={assigned === r.id}
          keepOpen={keepOpen}
        >
          {r.name}
        </MenuLink>
      ))}
      <MenuLink href={href({ assigned: "all" })} selected={assigned === "all"} keepOpen={keepOpen}>
        Everyone
      </MenuLink>
      <MenuLink
        href={href({ assigned: "unassigned" })}
        selected={assigned === "unassigned"}
        keepOpen={keepOpen}
      >
        No one (unassigned)
      </MenuLink>
    </>
  );
  const decisionItems = (keepOpen: boolean) =>
    DECISION_FILTERS.map(([v, label]) => (
      <MenuLink
        key={v}
        href={href({ decision: v })}
        selected={filters.decision === v}
        keepOpen={keepOpen}
      >
        {label}
      </MenuLink>
    ));
  const labelItems = labels.map((l) => (
    <MenuCheckbox
      key={l.submittableLabelId}
      checked={selectedLabels.includes(l.submittableLabelId)}
      onToggle={() => toggleLabel(l.submittableLabelId)}
    >
      {l.name}
    </MenuCheckbox>
  ));
  const countBadge = (n: number) =>
    n > 0 && (
      <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 bg-accent text-bg text-[10px] tabular-nums">
        {n}
      </span>
    );
  const secondaryCount =
    Number(assigned !== DEFAULT_FILTERS.assigned) +
    Number(filters.decision !== DEFAULT_FILTERS.decision) +
    selectedLabels.length;
  const currentStatus = STATUS_GROUPS.find((g) => g.value === filters.status)!;
  const resetHref = `/submissions${filtersToQuery(DEFAULT_FILTERS)}`;
  const search = (
    <input
      type="search"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder="Search artist or title"
      aria-label="Search artist or title"
      className="w-full bg-surface border border-border text-sm text-text px-3 py-2 sm:py-1.5 outline-none focus:border-accent transition-colors"
    />
  );

  return (
    <div className="space-y-2">
      {/* Phones: status and everything else each behind one button (opening
          as bottom sheets), so nothing scrolls sideways out of sight. */}
      <div className="sm:hidden space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Menu
            sheetTitle="Status"
            buttonClassName="flex w-full items-center justify-between gap-2 text-sm px-3 py-2 border border-border text-text"
            label={
              <span>
                {currentStatus.label}
                <span className="ml-1.5 text-text-muted tabular-nums">
                  {statusCounts[filters.status]}
                </span>
              </span>
            }
          >
            {STATUS_GROUPS.map((g) => (
              <MenuLink
                key={g.value}
                href={href({ status: g.value })}
                selected={filters.status === g.value}
              >
                <span className="flex justify-between gap-3">
                  {g.label}
                  <span className="text-text-muted tabular-nums">{statusCounts[g.value]}</span>
                </span>
              </MenuLink>
            ))}
          </Menu>
          <Menu
            sheetTitle="Filters"
            active={secondaryCount > 0}
            buttonClassName={`flex w-full items-center justify-between gap-2 text-sm px-3 py-2 border ${
              secondaryCount > 0 ? "border-accent text-text" : "border-border text-text"
            }`}
            label={
              <span>
                Filters
                {countBadge(secondaryCount)}
              </span>
            }
          >
            <MenuHeading>Assigned to</MenuHeading>
            {assignedItems(true)}
            <MenuDivider />
            <MenuHeading>{whoseDecision}</MenuHeading>
            {decisionItems(true)}
            <MenuDivider />
            <MenuHeading>Labels</MenuHeading>
            {labelItems}
            {!isDefaultFilters(filters) && (
              <>
                <MenuDivider />
                <MenuLink href={resetHref}>Reset to my queue</MenuLink>
              </>
            )}
          </Menu>
        </div>
        {search}
      </div>

      <div className="hidden sm:flex flex-wrap items-center gap-2">
        <div className="flex border border-border" role="group" aria-label="Status">
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

        <span aria-hidden className="w-px h-5 bg-border mx-1" />

        <Menu
          sheetTitle="Assigned to"
          active={assigned !== DEFAULT_FILTERS.assigned}
          label={
            <span className="truncate max-w-48">
              <span className="text-text-muted">Assigned:</span>{" "}
              <span className="text-text">{assignedLabel}</span>
            </span>
          }
        >
          {assignedItems(false)}
        </Menu>

        <Menu
          sheetTitle={whoseDecision}
          active={filters.decision !== DEFAULT_FILTERS.decision}
          label={
            <span>
              <span className="text-text-muted">Decision:</span>{" "}
              <span className="text-text">{decisionLabel}</span>
            </span>
          }
        >
          <MenuHeading>{whoseDecision}</MenuHeading>
          {decisionItems(false)}
        </Menu>

        <Menu
          sheetTitle="Labels"
          active={selectedLabels.length > 0}
          panelClassName="w-56"
          label={
            <span>
              <span className={selectedLabels.length ? "text-text" : ""}>Labels</span>
              {countBadge(selectedLabels.length)}
            </span>
          }
        >
          {labelItems}
          {selectedLabels.length > 0 && (
            <>
              <MenuDivider />
              <MenuLink href={href({ labels: [] })}>Clear labels</MenuLink>
            </>
          )}
        </Menu>

        <div className="relative flex-1 min-w-56">{search}</div>

        {!isDefaultFilters(filters) && (
          <Link
            href={resetHref}
            scroll={false}
            className="text-xs text-text-muted underline hover:text-text whitespace-nowrap"
          >
            Reset to my queue
          </Link>
        )}
      </div>

      {filters.labels.length > 0 && (
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
        </div>
      )}
    </div>
  );
}
