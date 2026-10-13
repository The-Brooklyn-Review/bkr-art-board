import type { LibraryAsset } from "@/lib/art-library/getAssets";

export function ActionLinks({
  asset,
  isPending,
  isStarred,
  onToggleStar,
  onHide,
  onShare,
  shareLabel,
  shareBusy = false,
  onShareSubmission,
  shareSubmissionLabel,
  shareSubmissionBusy = false,
  onPublish,
  publishPending = false,
  published = false,
}: {
  asset: LibraryAsset;
  isPending: boolean;
  isStarred: boolean;
  onToggleStar: () => void;
  onHide: () => void;
  onShare: () => void;
  shareLabel: string;
  shareBusy?: boolean;
  /** The whole submission's visible pieces (/share/s/…). */
  onShareSubmission: () => void;
  shareSubmissionLabel: string;
  shareSubmissionBusy?: boolean;
  onPublish: () => void;
  publishPending?: boolean;
  published?: boolean;
}) {
  // Desktop: [Star] [Share link] [Open in Submittable] [Mark as Published] | tertiary links
  // Share is a headline action (deliberately more prominent than Publish),
  // so it gets the same solid-accent treatment as Open in Submittable.
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <button
        onClick={onToggleStar}
        className="text-2xl leading-none hover:scale-110 transition-transform cursor-pointer"
        title={isStarred ? "Remove from starred" : "Add to starred"}
        aria-label={isStarred ? "Remove from starred" : "Add to starred"}
      >
        {isStarred ? "⭐" : "☆"}
      </button>

      <button
        onClick={onShare}
        disabled={shareBusy}
        className="font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        {shareLabel}
      </button>

      <button
        onClick={onShareSubmission}
        disabled={shareSubmissionBusy}
        title="Copy a link to every piece in this submission"
        className="font-semibold px-3 py-2 rounded border border-accent/60 text-text hover:bg-bg-hover disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        {shareSubmissionLabel}
      </button>

      {asset.submittableUrl && (
        <a
          href={asset.submittableUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold px-3 py-2 rounded border border-border text-text hover:bg-bg-hover transition-colors"
        >
          Open in Submittable
        </a>
      )}

      <button
        onClick={onPublish}
        disabled={isPending || publishPending || published}
        className="font-semibold px-3 py-2 rounded border border-border text-text hover:bg-bg-hover transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        {published ? "✓ Published" : publishPending ? "Publishing…" : "Mark as Published"}
      </button>

      <span className="text-border">|</span>

      <div className="flex items-center gap-4 text-xs">
        {asset.originalUrl && (
          <a
            href={asset.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-accent transition-colors"
          >
            Open Original File
          </a>
        )}

        <span className="text-border">·</span>

        <button
          onClick={onHide}
          disabled={isPending}
          className="text-text-muted hover:text-accent transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? "Hiding…" : "Hide"}
        </button>

        <span className="text-border">·</span>

        <a href={asset.reviewUrl} className="text-text-muted hover:text-accent transition-colors">
          View Submission
        </a>
      </div>
    </div>
  );
}
