"use client";

import { useState } from "react";

export function CollapsibleText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-text-muted underline hover:text-text"
      >
        {open ? `Hide ${label.toLowerCase()}` : label}
      </button>
      {open && (
        <p className="text-xs text-text-muted mt-1 max-w-md whitespace-pre-wrap max-h-24 overflow-y-auto">
          {text}
        </p>
      )}
    </div>
  );
}
