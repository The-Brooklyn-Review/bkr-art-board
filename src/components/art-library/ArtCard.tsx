import { useRef } from "react";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { KNOWN_LABELS, displayLabel } from "@/lib/art-library/labels";

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
  onHoverIntent,
}: {
  asset: LibraryAsset;
  onOpen: () => void;
  /** Called after the pointer lingers on the card for a moment — a quick
   * pass-through while scrolling shouldn't trigger a prefetch. */
  onHoverIntent?: () => void;
}) {
  const knownLabels = asset.labels
    .filter((l) => KNOWN_LABELS.includes(l.name))
    .sort((a, b) => KNOWN_LABELS.indexOf(a.name) - KNOWN_LABELS.indexOf(b.name));

  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => {
        if (!onHoverIntent) return;
        hoverTimeout.current = setTimeout(onHoverIntent, 150);
      }}
      onMouseLeave={() => clearTimeout(hoverTimeout.current)}
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
