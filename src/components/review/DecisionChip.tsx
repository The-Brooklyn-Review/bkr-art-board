import { decisionLabel } from "@/lib/reviewer/decisions";

// Muted, distinguishable tones that sit on the dark ground without
// competing with the artwork. Paired with text, never colour alone.
export const DECISION_TONE: Record<string, string> = {
  accept: "text-[#a9c79a] border-[#4b5e42]",
  tiered_reject: "text-[#d9c08c] border-[#5e5236]",
  reject: "text-[#d79a8c] border-[#64403a]",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function DecisionChip({
  reviewerName,
  decision,
  pushStatus,
  compact = false,
}: {
  reviewerName: string;
  decision: string;
  pushStatus?: string;
  compact?: boolean;
}) {
  const failed = pushStatus === "failed" || pushStatus === "unknown";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-xs whitespace-nowrap ${
        DECISION_TONE[decision] ?? "text-text-muted border-border"
      }`}
      title={`${reviewerName}: ${decisionLabel(decision)}${failed ? " — not confirmed in Submittable" : ""}`}
    >
      <span className="text-text-muted">{compact ? initials(reviewerName) : reviewerName}</span>
      {decisionLabel(decision)}
      {failed && (
        <span className="text-red-300" aria-label="not posted">
          !
        </span>
      )}
    </span>
  );
}
