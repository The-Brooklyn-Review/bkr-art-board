import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/sharePreview";

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
  const { artistName, submissionTitle } = await getShare(token);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/share/${token}/image`}
          alt={submissionTitle || "Shared artwork"}
          className="max-w-full max-h-[70vh] object-contain border border-border"
        />
        <p className="font-[family-name:var(--font-display)] text-2xl text-text mt-6">
          {submissionTitle || "Untitled"}
        </p>
        {artistName && <p className="text-text-muted mt-1">By {artistName}</p>}
        <p className="text-xs text-text-muted mt-8 uppercase tracking-wide">
          Shared from The Brooklyn Review Art Board
        </p>
      </div>
    </main>
  );
}
