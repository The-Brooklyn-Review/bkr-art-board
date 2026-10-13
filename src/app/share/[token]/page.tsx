import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openInAppUrl, resolveShareToken } from "@/lib/sharePreview";
import { SharePreviewViewer } from "./SharePreviewViewer";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from "@/lib/processing/previewCard";

// Re-validated on every request — a link revoked (replaced) or expired a
// second ago must stop resolving immediately, not whenever a cache expires.
export const dynamic = "force-dynamic";

async function getShare(token: string) {
  const resolved = await resolveShareToken(token);
  if (!resolved) notFound();
  return resolved;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) return {};

  const title = resolved.submissionTitle || "Untitled";
  const description = resolved.artistName
    ? `By ${resolved.artistName} — shared from The Brooklyn Review Art Board`
    : "Shared from The Brooklyn Review Art Board";
  // A purpose-made JPEG card (./og), with its size declared: some
  // previewers (Facebook, WhatsApp) skip an image whose size they'd have to
  // fetch it to learn, and not all of them show WebP.
  const image = {
    url: `/share/${token}/og`,
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

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { assetId, submissionId, artistName, submissionTitle } = await getShare(token);
  const openUrl = await openInAppUrl(submissionId, assetId);

  return (
    <main className="min-h-screen bg-bg">
      <SharePreviewViewer
        imageUrl={`/share/${token}/image`}
        alt={submissionTitle || "Shared artwork"}
        artistName={artistName}
        submissionTitle={submissionTitle}
        openUrl={openUrl}
      />
    </main>
  );
}
