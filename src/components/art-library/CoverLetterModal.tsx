"use client";

import { createPortal } from "react-dom";
import { useModalTransition, MODAL_TRANSITION_STYLE } from "@/lib/hooks/useModalTransition";

export function CoverLetterModal({
  open,
  onClose,
  title,
  content,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
}) {
  const { rendered, visible } = useModalTransition(open, onClose);
  if (!rendered) return null;
  // See ConfirmModal: portaled for the same reason.
  return createPortal(
    <>
      {/* Overlay - mobile only. z-[10000]/z-[10001]: above the lightbox
          library's own root, which sets z-index: 9999. */}
      <div
        className={`fixed inset-0 bg-black/30 z-[10000] sm:hidden transition-opacity ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={MODAL_TRANSITION_STYLE}
        onClick={onClose}
      />

      {/* Desktop: Right slide panel */}
      <div
        className={`hidden sm:fixed sm:right-0 sm:top-0 sm:h-screen sm:w-80 sm:bg-bg sm:border-l sm:border-border sm:flex sm:flex-col sm:z-[10001] sm:transition-transform ${
          visible ? "sm:translate-x-0" : "sm:translate-x-full"
        }`}
        style={MODAL_TRANSITION_STYLE}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-text text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <p className="text-sm text-text-muted whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>

      {/* Mobile: Bottom drawer */}
      <div
        className={`fixed sm:hidden bottom-0 left-0 right-0 bg-bg border-t border-border rounded-t-lg z-[10001] transition-transform flex flex-col max-h-[70vh] ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={MODAL_TRANSITION_STYLE}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-text text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <p className="text-sm text-text-muted whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>
    </>,
    document.body,
  );
}
