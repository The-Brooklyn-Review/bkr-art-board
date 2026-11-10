// The links at the foot of a shared artwork or submission. Submittable is
// the headline action (primary button); the Art Board is the tertiary text
// link beside it. Without SUBMITTABLE_WEB_BASE_URL there's no Submittable
// link, and the Art Board link takes the primary slot instead.
export function ShareActions({
  submittableUrl,
  openUrl,
  className = "",
}: {
  submittableUrl: string | null;
  /** Gallery, or the review page for work that isn't in it (openInAppUrl). */
  openUrl: string;
  className?: string;
}) {
  const primary =
    "inline-block font-semibold px-3 py-2 rounded bg-accent text-black hover:opacity-90";

  if (!submittableUrl) {
    return (
      <div className={className}>
        <a href={openUrl} className={primary}>
          Open in BKR Art Board
        </a>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
      <a href={submittableUrl} target="_blank" rel="noopener noreferrer" className={primary}>
        Open in Submittable
      </a>
      <a href={openUrl} className="text-sm text-text-muted hover:text-accent transition-colors">
        Open in BKR Art Board
      </a>
    </div>
  );
}
