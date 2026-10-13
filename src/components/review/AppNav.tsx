import Link from "next/link";

/** Shared top bar for the gallery and the reviewer. */
export function AppNav({
  current,
  reviewerName,
  children,
}: {
  current: "gallery" | "review";
  reviewerName?: string | null;
  children?: React.ReactNode;
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
    <div className="flex items-center justify-between gap-4 text-sm">
      <nav className="flex items-center gap-5" aria-label="Sections">
        <span className="font-[family-name:var(--font-display)] text-base text-text mr-1">BKR</span>
        {tab("/submissions", "Review", current === "review")}
        {tab("/art-library", "Gallery", current === "gallery")}
      </nav>
      <div className="flex items-center gap-4">
        {children}
        {reviewerName && (
          <Link
            href="/reviewer?switch=1"
            className="text-xs text-text-muted hover:text-text"
            title="Switch reviewer"
          >
            {reviewerName}
          </Link>
        )}
      </div>
    </div>
  );
}
