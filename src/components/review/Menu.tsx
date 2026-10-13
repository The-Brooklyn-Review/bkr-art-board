"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A menu: a button that shows its current value, and a panel of choices.
// Desktop: a popover anchored to the button. Phones: a bottom sheet — a
// popover there runs off the screen edge and its targets are too small.
// Closes on outside click, Escape, or choosing an item (unless the item
// asks to keep it open, e.g. multi-select labels).

const SHEET_QUERY = "(max-width: 639px)";

const CloseContext = createContext<() => void>(() => {});

export function Menu({
  label,
  children,
  align = "left",
  active = false,
  buttonClassName,
  panelClassName = "w-64",
  ariaLabel,
  chevron = true,
  sheetTitle,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  /** Styled as "set" (a non-default filter value). */
  active?: boolean;
  buttonClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
  chevron?: boolean;
  /** Heading for the phone sheet; defaults to ariaLabel. */
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asSheet, setAsSheet] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const toggle = () => {
    // Decided at open time: the menu only exists after a tap, so there's no
    // server render to mismatch.
    if (!open) setAsSheet(window.matchMedia(SHEET_QUERY).matches);
    setOpen((o) => !o);
  };

  // A sheet keeps the page behind it from scrolling.
  useEffect(() => {
    if (!open || !asSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, asSheet]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !sheetRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={toggle}
        className={
          buttonClassName ??
          `flex items-center gap-1.5 text-xs px-3 py-1.5 border transition-colors whitespace-nowrap ${
            active
              ? "border-accent text-text"
              : "border-border text-text-muted hover:border-text-muted hover:text-text"
          } ${open ? "border-text-muted text-text" : ""}`
        }
      >
        {label}
        {chevron && <Chevron open={open} />}
      </button>
      {open && !asSheet && (
        <div
          id={id}
          role="menu"
          className={`absolute z-30 mt-1 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-surface border border-border shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 ${
            align === "right" ? "right-0" : "left-0"
          } ${panelClassName}`}
        >
          <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
        </div>
      )}
      {open &&
        asSheet &&
        // Portaled: the sticky header's blur and slide create a containing
        // block that would trap a fixed-position sheet inside it.
        createPortal(
          <div ref={sheetRef} className="fixed inset-0 z-50 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60"
            />
            <div
              id={id}
              role="menu"
              aria-label={sheetTitle ?? ariaLabel}
              className="relative bg-surface border-t border-border max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="font-[family-name:var(--font-display)] text-lg text-text">
                  {sheetTitle ?? ariaLabel ?? ""}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-accent px-2 py-1"
                >
                  Done
                </button>
              </div>
              <div className="overflow-y-auto py-1">
                <CloseContext.Provider value={() => setOpen(false)}>
                  {children}
                </CloseContext.Provider>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 6"
      className={`w-2.5 h-2.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const itemClass =
  "flex w-full items-center gap-3 px-4 py-2.5 text-[15px] sm:gap-2.5 sm:px-3 sm:py-2 sm:text-sm text-left text-text-muted hover:bg-bg-hover hover:text-text focus-visible:bg-bg-hover focus-visible:text-text outline-none";

function Check({ on, multi }: { on: boolean; multi?: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center text-[10px] ${
        multi ? `border ${on ? "bg-accent border-accent text-bg" : "border-text-muted"}` : ""
      } ${!multi && on ? "text-accent" : ""}`}
    >
      {on ? "✓" : ""}
    </span>
  );
}

/** A choice that navigates (filters live in the URL). */
export function MenuLink({
  href,
  selected,
  multi,
  keepOpen,
  children,
}: {
  href: string;
  selected?: boolean;
  multi?: boolean;
  keepOpen?: boolean;
  children: React.ReactNode;
}) {
  const close = useContext(CloseContext);
  return (
    <Link
      href={href}
      scroll={false}
      role={multi ? "menuitemcheckbox" : selected !== undefined ? "menuitemradio" : "menuitem"}
      aria-checked={selected}
      onClick={() => !keepOpen && close()}
      className={`${itemClass} ${selected ? "text-text" : ""}`}
    >
      {selected !== undefined && <Check on={selected} multi={multi} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

/** A checkbox item that stays open, for picking several at once. */
export function MenuCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`${itemClass} ${checked ? "text-text" : ""}`}
    >
      <Check on={checked} multi />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/** A single choice that stays open (one of several local options). */
export function MenuRadio({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className={`${itemClass} ${checked ? "text-text" : ""}`}
    >
      <Check on={checked} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuButton({
  onSelect,
  disabled,
  children,
  hint,
}: {
  onSelect: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  const close = useContext(CloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={`${itemClass} disabled:opacity-40`}
    >
      <span className="flex-1">{children}</span>
      {hint && <kbd className="text-xs text-text-muted">{hint}</kbd>}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-1 border-t border-border" />;
}

export function MenuHeading({ children }: { children: React.ReactNode }) {
  return <p className="px-4 sm:px-3 pt-3 sm:pt-2 pb-1 text-xs text-text-muted">{children}</p>;
}
