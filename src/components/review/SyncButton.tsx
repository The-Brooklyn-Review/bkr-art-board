"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/lib/actions/review";

export function SyncButton({ lastSynced }: { lastSynced: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-text-muted hidden sm:inline" aria-live="polite">
        {pending ? "Syncing with Submittable…" : result ? result.text : `Synced ${lastSynced}`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncNow();
            setResult(
              r.ok ? { ok: true, text: r.message ?? "Synced." } : { ok: false, text: r.error },
            );
          })
        }
        className="border border-border px-3 py-1.5 text-text hover:border-accent disabled:opacity-50 transition-colors"
        title="Pull the latest statuses, labels and assignments from Submittable"
      >
        {pending ? "Syncing…" : "Sync"}
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-red-300 sm:hidden">
          {result.text}
        </span>
      )}
    </div>
  );
}
