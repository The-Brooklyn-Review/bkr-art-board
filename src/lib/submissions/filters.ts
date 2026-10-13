// Reviewer list filters (docs/SPEC-review-and-sync.md §9.1). They live in
// the URL so a filtered view is bookmarkable and next/previous on the
// detail page walks the same list. Pure — shared by server and client.
import { STATUS_GROUPS, type StatusGroup } from "@/lib/submittable/statuses";

export type AssignedFilter = "me" | "unassigned" | "all" | string; // or a Reviewer id
export type MineFilter = "todo" | "done" | "any";

export interface QueueFilters {
  status: StatusGroup;
  assigned: AssignedFilter;
  /** Submittable label IDs; a submission must have all of them. */
  labels: string[];
  mine: MineFilter;
  q: string;
}

export const DEFAULT_FILTERS: QueueFilters = {
  status: "undecided",
  assigned: "me",
  labels: [],
  mine: "any",
  q: "",
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(params: Params): QueueFilters {
  const status = first(params.status);
  const assigned = first(params.assigned);
  const mine = first(params.mine);
  const labels = first(params.labels);
  return {
    status: STATUS_GROUPS.some((g) => g.value === status)
      ? (status as StatusGroup)
      : DEFAULT_FILTERS.status,
    assigned:
      assigned === "me" ||
      assigned === "unassigned" ||
      assigned === "all" ||
      /^[0-9a-f-]{36}$/i.test(assigned)
        ? assigned
        : DEFAULT_FILTERS.assigned,
    labels: labels ? labels.split(",").filter((l) => /^[0-9a-f-]{36}$/i.test(l)) : [],
    mine: mine === "todo" || mine === "done" ? mine : "any",
    q: first(params.q).slice(0, 100),
  };
}

/** Only non-default values, so URLs stay short and readable. */
export function filtersToQuery(f: QueueFilters, overrides: Partial<QueueFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (merged.status !== DEFAULT_FILTERS.status) p.set("status", merged.status);
  if (merged.assigned !== DEFAULT_FILTERS.assigned) p.set("assigned", merged.assigned);
  if (merged.labels.length) p.set("labels", merged.labels.join(","));
  if (merged.mine !== DEFAULT_FILTERS.mine) p.set("mine", merged.mine);
  if (merged.q) p.set("q", merged.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function isDefaultFilters(f: QueueFilters): boolean {
  return filtersToQuery(f) === "";
}
