import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openInAppUrl, resolveSubmissionShareToken } from "@/lib/sharePreview";
import { SubmissionShareViewer } from "./SubmissionShareViewer";

// A whole submission's pieces, shared publicly — see
// resolveSubmissionShareToken. Re-validated on every request, like the
// single-artwork page: a replaced or expired link stops working at once.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolveSubmissionShareToken(token);
  if (!resolved) return {};

  const title = resolved.submissionTitle || "Untitled";
  const count = resolved.assets.length;
  const description = `${resolved.artistName ? `By ${resolved.artistName} · ` : ""}${count} ${
    count === 1 ? "piece" : "pieces"
  } — shared from The Brooklyn Review Art Board`;
  const imageUrl = `/share/s/${token}/${resolved.assets[0].id}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function SubmissionSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveSubmissionShareToken(token);
  if (!resolved) notFound();
  const openUrl = await openInAppUrl(resolved.submissionId, resolved.assets[0].id);

  return (
    <main className="min-h-screen bg-bg">
      <SubmissionShareViewer
        pieces={resolved.assets.map((a) => ({
          src: `/share/s/${token}/${a.id}`,
          width: a.width,
          height: a.height,
        }))}
        artistName={resolved.artistName}
        submissionTitle={resolved.submissionTitle}
        openUrl={openUrl}
      />
    </main>
  );
}
