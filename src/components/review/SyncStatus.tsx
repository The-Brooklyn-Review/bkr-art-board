"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { syncNow } from "@/lib/actions/review";

type AutoSyncResult = { ok: true; ran: boolean; changed: boolean } | { ok: false; error: string };

async function autoSync(): Promise<AutoSyncResult> {
  const res = await fetch("/api/sync", { method: "POST" });
  return (await res.json()) as AutoSyncResult;
}

/** Fired by "Sync now" in the reviewer menu. */
export const SYNC_NOW_EVENT = "bkr:sync-now";
const FAILED_KEY = "bkr_autosync_failed_at";
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

function recentlyFailed(): boolean {
  try {
    const at = Number(sessionStorage.getItem(FAILED_KEY));
    return !!at && Date.now() - at < RETRY_AFTER_FAILURE_MS;
  } catch {
    return false;
  }
}
function markFailed(failed: boolean) {
  try {
    if (failed) sessionStorage.setItem(FAILED_KEY, String(Date.now()));
    else sessionStorage.removeItem(FAILED_KEY);
  } catch {
    /* storage unavailable — fine */
  }
}

/**
 * "Synced 9:41 AM" — plain status text, not a control. When the last sync
 * is stale it syncs in the background and refreshes the page if anything
 * changed, so nobody has to think about syncing.
 */
export function SyncStatus({ lastSynced, stale }: { lastSynced: string; stale: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "failed" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!stale || started.current || recentlyFailed()) return;
    started.current = true;
    setState("syncing");
    autoSync()
      .then((r) => {
        markFailed(!r.ok);
        if (!r.ok) {
          setState("failed");
          setMessage(r.error);
          return;
        }
        if (r.ran) {
          setState("done");
          setMessage("Synced just now");
        } else setState("idle");
        if (r.changed) router.refresh();
      })
      .catch(() => {
        markFailed(true);
        setState("failed");
      });
  }, [stale, router]);

  useEffect(() => {
    const run = () => {
      setState("syncing");
      syncNow()
        .then((r) => {
          markFailed(!r.ok);
          setState(r.ok ? "done" : "failed");
          setMessage(r.ok ? (r.message ?? "Synced.") : r.error);
          router.refresh();
        })
        .catch(() => setState("failed"));
    };
    window.addEventListener(SYNC_NOW_EVENT, run);
    return () => window.removeEventListener(SYNC_NOW_EVENT, run);
  }, [router]);

  const text =
    state === "syncing"
      ? "Syncing with Submittable…"
      : state === "failed"
        ? "Couldn’t reach Submittable"
        : state === "done" && message
          ? message
          : `Synced ${lastSynced}`;

  return (
    <span
      className={`text-xs whitespace-nowrap ${state === "failed" ? "text-red-300" : "text-text-muted"}`}
      aria-live="polite"
      title={
        state === "failed" && message
          ? message
          : "Statuses, labels and assignments refresh from Submittable automatically"
      }
    >
      {state === "syncing" && (
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1.5 align-middle animate-pulse"
        />
      )}
      {text}
    </span>
  );
}
