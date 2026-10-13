import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openInAppUrl, resolveSubmissionShareToken } from "@/lib/sharePreview";
import { SubmissionShareViewer } from "./SubmissionShareViewer";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from "@/lib/processing/previewCard";

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
  // A purpose-made JPEG card of the first pieces (./og), size declared —
  // see the single-artwork page.
  const image = {
    url: `/share/s/${token}/og`,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    type: "image/jpeg",
    alt: title,
  };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
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
  const startIndex = Math.max(
    0,
    resolved.assets.findIndex((a) => a.id === resolved.featuredAssetId),
  );
  const openUrl = await openInAppUrl(resolved.submissionId, resolved.assets[startIndex].id);

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
        startIndex={startIndex}
      />
    </main>
  );
}
