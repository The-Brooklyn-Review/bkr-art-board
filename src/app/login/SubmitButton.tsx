"use client";

import { useFormStatus } from "react-dom";

/** Changes the moment it's pressed: signing in waits on a deliberate delay
 * and the Gallery's first render, and an unchanged button read as a dead
 * click. Disabled meanwhile so a second press doesn't send it twice. */
export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-bg px-4 py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-wait"
    >
      {pending ? "Signing in…" : "Enter"}
    </button>
  );
}
