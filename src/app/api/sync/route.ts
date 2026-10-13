// Background sync, called by pages when the last sync is stale (see
// SyncStatus). A route handler rather than a server action on purpose:
// Next runs a page's server actions one at a time, so a multi-second sync
// started on page open used to make the reviewer's first label click or
// decision wait behind it. Requests to a route handler don't queue.
import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/requireAuth";
import { AUTO_SYNC_AFTER_MS } from "@/lib/sync/autoSync";
import { formatSyncSummary, lastSyncedAt, syncSubmittable } from "@/lib/sync/syncSubmittable";
import { describeSubmittableError } from "@/lib/submittable/writes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  if (!(await isAuthenticated())) {
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const last = await lastSyncedAt();
  if (last && Date.now() - last.getTime() < AUTO_SYNC_AFTER_MS) {
    return Response.json({ ok: true, ran: false, changed: false });
  }
  try {
    const summary = await syncSubmittable();
    console.log(formatSyncSummary(summary));
    const changed = summary.updated > 0 || summary.deleted.length > 0;
    if (changed) {
      revalidatePath("/submissions", "layout");
      revalidatePath("/art-library");
    }
    return Response.json({ ok: true, ran: true, changed });
  } catch (err) {
    return Response.json({ ok: false, error: describeSubmittableError(err) });
  }
}
