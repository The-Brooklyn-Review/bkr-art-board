"use client";

import { createPortal } from "react-dom";
import type { LibraryAsset } from "@/lib/art-library/getAssets";
import { useModalTransition, MODAL_TRANSITION_STYLE } from "@/lib/hooks/useModalTransition";

export function MoreActionsSheet({
  open,
  onClose,
  asset,
  isPending,
  onHide,
  onPublish,
  publishPending = false,
  published = false,
}: {
  open: boolean;
  onClose: () => void;
  asset: LibraryAsset;
  isPending: boolean;
  onHide: () => void;
  onPublish: () => void;
  publishPending?: boolean;
  published?: boolean;
}) {
  const { rendered, visible } = useModalTransition(open, onClose);
  if (!rendered) return null;
  // Portaled bottom sheet, not an inline accordion under the "More actions"
  // button: the footer this lives in already has its own fixed max-height
  // and overflow-y-auto (see LIGHTBOX_FOOTER_MAX_HEIGHT) to make room
  // for metadata above it. An inline-expanded list competed with that for
  // space — expanded items landed below the footer's own scroll boundary
  // with no visual cue, effectively invisible until scrolled to by luck.
  // A sheet has its own independent scroll region, so it can't collide.
  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-[10000] transition-opacity ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={MODAL_TRANSITION_STYLE}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 bg-bg border-t border-border rounded-t-lg z-[10001] flex flex-col max-h-[70vh] transition-transform ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={MODAL_TRANSITION_STYLE}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-text text-base">More actions</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col p-2 overflow-y-auto">
          <button
            onClick={onPublish}
            disabled={isPending || publishPending || published}
            className="text-left px-4 py-3 rounded text-sm font-medium text-text hover:bg-bg-hover disabled:opacity-50"
          >
            {published ? "✓ Published" : publishPending ? "Publishing…" : "Mark as Published"}
          </button>

          {asset.originalUrl && (
            <a
              href={asset.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 rounded text-sm text-text hover:bg-bg-hover"
            >
              Open Original File
            </a>
          )}

          <button
            onClick={onHide}
            disabled={isPending}
            className="text-left px-4 py-3 rounded text-sm text-text hover:bg-bg-hover disabled:opacity-50"
          >
            {isPending ? "Hiding…" : "Hide"}
          </button>

          <a
            href={asset.reviewUrl}
            className="px-4 py-3 rounded text-sm text-text hover:bg-bg-hover"
          >
            View Submission
          </a>
        </div>
      </div>
    </>,
    document.body,
  );
}
