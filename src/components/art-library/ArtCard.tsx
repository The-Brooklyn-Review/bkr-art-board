import type { LibraryAsset } from "@/lib/art-library/getAssets";

const KNOWN_LABEL_ORDER = [
  "landscape",
  "photography",
  "figurative",
  "painting/drawing",
  "collage",
  "abstract",
  "multimedia",
];

function displayLabel(name: string): string {
  return name
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

const USED_STATE_LABELS: Record<string, string> = {
  available: "Available",
  candidate: "Candidate",
  reserved: "Reserved",
  selected: "Selected",
  published: "Published",
  do_not_use: "Do not use",
};

export function ArtCard({
  asset,
  onOpen,
}: {
  asset: LibraryAsset;
  onOpen: () => void;
}) {
  const knownLabels = asset.labels
    .filter((l) => KNOWN_LABEL_ORDER.includes(l.name))
    .sort((a, b) => KNOWN_LABEL_ORDER.indexOf(a.name) - KNOWN_LABEL_ORDER.indexOf(b.name));

  return (
    <button
      onClick={onOpen}
      className="group mb-4 block w-full text-left break-inside-avoid cursor-zoom-in"
    >
      <div className="overflow-hidden bg-surface border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.thumbnailUrl}
          alt={asset.submissionTitle ?? ""}
          loading="lazy"
          width={asset.width ?? undefined}
          height={asset.height ?? undefined}
          className="w-full h-auto block transition-opacity duration-200 group-hover:opacity-90"
        />
      </div>
      <div className="pt-2 px-0.5">
        <p className="font-[family-name:var(--font-display)] text-sm text-text truncate">
          {asset.artistName}
        </p>
        {asset.submissionTitle && (
          <p className="text-xs text-text-muted truncate">{asset.submissionTitle}</p>
        )}
        {knownLabels.length > 0 && (
          <p className="text-[11px] text-accent uppercase tracking-wide mt-0.5 truncate">
            {knownLabels.map((l) => displayLabel(l.name)).join(" · ")}
          </p>
        )}
        {/* "Available" is the default for every asset until the Pairing UI
            exists to change it — showing it on every card is just noise
            until that's real. Only surfaces once a state actually diverges. */}
        {asset.usedState !== "available" && (
          <p className="text-[11px] text-text-muted mt-0.5">
            {USED_STATE_LABELS[asset.usedState] ?? asset.usedState}
          </p>
        )}
      </div>
    </button>
  );
}
