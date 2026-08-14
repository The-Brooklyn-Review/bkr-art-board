import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/sharePreview";
import { SharePreviewViewer } from "./SharePreviewViewer";

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
  const imageUrl = `/share/${token}/image`;

  return {
    title,
    description,
    openGraph: { title, description, images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { assetId, artistName, submissionTitle } = await getShare(token);

  return (
    <main className="min-h-screen bg-bg">
      <SharePreviewViewer
        imageUrl={`/share/${token}/image`}
        alt={submissionTitle || "Shared artwork"}
        artistName={artistName}
        submissionTitle={submissionTitle}
        assetId={assetId}
      />
    </main>
  );
}
