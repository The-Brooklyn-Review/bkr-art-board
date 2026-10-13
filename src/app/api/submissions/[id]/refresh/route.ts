// Opening a submission re-reads its status and labels from Submittable.
// A route handler, not a server action, so it never makes the reviewer's
// first click (a label, a decision) wait behind it — see api/sync/route.ts.
import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/requireAuth";
import { refreshOneSubmission } from "@/lib/sync/refreshOne";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return Response.json({ changed: false }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ changed: false }, { status: 400 });
  try {
    const changed = await refreshOneSubmission(id);
    if (changed) {
      revalidatePath(`/submissions/${id}`);
      revalidatePath("/submissions");
    }
    return Response.json({ changed });
  } catch (err) {
    console.warn("refresh failed", id, err);
    return Response.json({ changed: false });
  }
}
