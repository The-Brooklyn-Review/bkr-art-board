import type { LibraryAsset } from "@/lib/art-library/getAssets";

export function ActionLinks({
  asset,
  isPending,
  isStarred,
  onToggleStar,
  onHide,
  onShare,
  sharePending = false,
  shareCopied = false,
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
  sharePending?: boolean;
  shareCopied?: boolean;
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
        className="text-2xl leading-none hover:scale-110 transition-transform"
        title={isStarred ? "Remove from starred" : "Add to starred"}
        aria-label={isStarred ? "Remove from starred" : "Add to starred"}
      >
        {isStarred ? "⭐" : "☆"}
      </button>

      <button
        onClick={onShare}
        disabled={sharePending}
        className="font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90 disabled:opacity-50"
      >
        {shareCopied ? "✓ Link copied" : sharePending ? "Copying…" : "Share link"}
      </button>

      {asset.submittableUrl && (
        <a
          href={asset.submittableUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold px-3 py-2 rounded border border-border text-text hover:bg-bg-hover"
        >
          Open in Submittable
        </a>
      )}

      <button
        onClick={onPublish}
        disabled={isPending || publishPending || published}
        className="font-semibold px-3 py-2 rounded border border-border text-text hover:bg-bg-hover disabled:opacity-50"
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
          className="text-text-muted hover:text-accent transition-colors disabled:opacity-50"
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
