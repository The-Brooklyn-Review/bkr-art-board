import Link from "next/link";
import { SyncStatus } from "@/components/review/SyncStatus";
import { ReviewerMenu } from "@/components/review/ReviewerMenu";

/** Shared top bar for the gallery and the reviewer. */
export function AppNav({
  current,
  reviewerName,
  sync,
}: {
  current: "gallery" | "review";
  reviewerName?: string | null;
  /** "Synced …" status; also syncs in the background when stale. */
  sync?: { lastSynced: string; stale: boolean };
}) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-1 py-1 border-b-2 transition-colors ${
        active ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center justify-between gap-4 text-sm min-h-8">
      <nav className="flex items-center gap-5" aria-label="Sections">
        <span className="font-[family-name:var(--font-display)] text-base text-text mr-1">BKR</span>
        {tab("/art-library", "Gallery", current === "gallery")}
        {tab("/submissions", "Review", current === "review")}
      </nav>
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {sync && (
          <span className="hidden sm:inline">
            <SyncStatus lastSynced={sync.lastSynced} stale={sync.stale} />
          </span>
        )}
        {reviewerName ? (
          <ReviewerMenu name={reviewerName} />
        ) : (
          <Link href="/reviewer" className="text-xs text-text-muted hover:text-text underline">
            Choose reviewer
          </Link>
        )}
      </div>
    </div>
  );
}
