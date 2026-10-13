"use client";

import { useState } from "react";

export function ReviewerPicker({
  action,
  next,
  currentId,
  reviewers,
}: {
  action: (formData: FormData) => Promise<void>;
  next: string;
  currentId: string | null;
  reviewers: { id: string; name: string; assigned: number }[];
}) {
  const [selected, setSelected] = useState<string | null>(
    currentId ?? (reviewers.length ? null : "new"),
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Reviewer</legend>
        {reviewers.map((r) => (
          <label
            key={r.id}
            className={`flex items-center justify-between gap-3 border px-4 py-3 cursor-pointer transition-colors ${
              selected === r.id
                ? "border-accent bg-surface"
                : "border-border hover:border-text-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="reviewerId"
                value={r.id}
                checked={selected === r.id}
                onChange={() => setSelected(r.id)}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-text">{r.name}</span>
            </span>
            {r.assigned > 0 && (
              <span className="text-xs text-text-muted">{r.assigned} assigned</span>
            )}
          </label>
        ))}
        <label
          className={`flex items-center gap-3 border px-4 py-3 cursor-pointer transition-colors ${
            selected === "new"
              ? "border-accent bg-surface"
              : "border-border hover:border-text-muted"
          }`}
        >
          <input
            type="radio"
            name="reviewerId"
            value="new"
            checked={selected === "new"}
            onChange={() => setSelected("new")}
            className="accent-[var(--color-accent)]"
          />
          <span className="text-text-muted">Someone else</span>
        </label>
      </fieldset>
      {selected === "new" && (
        <input
          name="newName"
          placeholder="Your name as it should appear on notes"
          autoFocus
          maxLength={80}
          required
          className="bg-surface border border-border text-text px-4 py-3 outline-none focus:border-accent"
        />
      )}
      <button
        type="submit"
        disabled={!selected}
        className="disabled:opacity-40 bg-accent text-bg px-4 py-3 font-medium hover:opacity-90 transition-opacity mt-4"
      >
        Continue
      </button>
    </form>
  );
}
