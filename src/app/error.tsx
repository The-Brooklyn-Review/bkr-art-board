"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

// Last resort for an error no component caught (see
// node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md).
// Next's default is a bare unstyled screen.
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-text-muted">
          That didn&apos;t load or save. It&apos;s usually a dropped connection or an expired
          sign-in — try again, and if it keeps happening, reload the page.
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="border border-accent px-3 py-1.5 hover:bg-surface"
          >
            Try again
          </button>
          <Link href="/art-library" className="border border-border px-3 py-1.5 hover:bg-surface">
            Back to the Gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
