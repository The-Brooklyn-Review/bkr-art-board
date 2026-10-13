"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { useModalTransition, MODAL_TRANSITION_STYLE } from "@/lib/hooks/useModalTransition";

export function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  isDestructive = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}) {
  const { rendered, visible } = useModalTransition(open, onCancel);
  const id = useId();
  if (!rendered) return null;
  // Portaled to document.body: rendered from inside the lightbox's slide
  // track, which the library positions via a CSS transform. Any non-none
  // transform on an ancestor makes it the containing block for our
  // position:fixed elements instead of the viewport, so without the portal
  // this renders in the wrong place (or only looks right by coincidence).
  return createPortal(
    // z-[10000]: above the lightbox library's own root, which sets z-index: 9999.
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4 transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={MODAL_TRANSITION_STYLE}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onClick={(e) => e.stopPropagation()}
        className={`bg-bg border border-border rounded-lg max-w-md w-full p-6 transition-[opacity,transform] ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        style={MODAL_TRANSITION_STYLE}
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold text-text mb-2">
          {title}
        </h2>
        <p id={`${id}-message`} className="text-sm text-text-muted mb-6">
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          {/* Focus starts on the safe choice, so Enter never confirms by accident. */}
          <button
            autoFocus
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-border hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded font-semibold text-white ${
              isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-accent text-black hover:opacity-90"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
