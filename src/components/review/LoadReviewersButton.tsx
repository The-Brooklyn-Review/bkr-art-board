"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadReviewersFromSubmittable } from "@/lib/actions/review";

export function LoadReviewersButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mb-6 border border-border px-4 py-3 text-sm">
      <p className="text-text-muted">
        Reviewer names haven&rsquo;t been loaded from Submittable yet. Load them to see who each
        submission is assigned to.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await loadReviewersFromSubmittable();
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="mt-3 border border-accent text-text px-3 py-1.5 hover:bg-surface disabled:opacity-50"
      >
        {pending ? "Loading from Submittable…" : "Load reviewers from Submittable"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
