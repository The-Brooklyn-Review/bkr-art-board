"use client";

import Link from "next/link";
import { Menu, MenuButton, MenuDivider } from "@/components/review/Menu";
import { SYNC_NOW_EVENT } from "@/components/review/SyncStatus";
import { initials } from "@/components/review/DecisionChip";

/** The reviewer's name as an obvious control: who you are, and the rarely-needed actions. */
export function ReviewerMenu({ name, onShortcuts }: { name: string; onShortcuts?: () => void }) {
  return (
    <Menu
      align="right"
      panelClassName="w-56"
      ariaLabel={`${name} — account menu`}
      buttonClassName="flex items-center gap-2 pl-1 pr-2 py-1 border border-border text-text-muted hover:text-text hover:border-text-muted transition-colors text-xs"
      label={
        <>
          <span
            aria-hidden
            className="w-6 h-6 rounded-full bg-accent/20 text-accent text-[11px] font-medium flex items-center justify-center"
          >
            {initials(name)}
          </span>
          <span className="hidden sm:inline text-text max-w-40 truncate">{name}</span>
        </>
      }
    >
      <p className="px-3 pt-2 pb-2 text-xs text-text-muted border-b border-border mb-1">
        Reviewing as <span className="text-text">{name}</span>
      </p>
      <Link
        href="/reviewer?switch=1"
        role="menuitem"
        className="flex w-full px-3 py-2 text-sm text-text-muted hover:bg-bg hover:text-text outline-none focus-visible:bg-bg"
      >
        Switch reviewer
      </Link>
      {onShortcuts && (
        <MenuButton onSelect={onShortcuts} hint="?">
          Keyboard shortcuts
        </MenuButton>
      )}
      <MenuDivider />
      <MenuButton onSelect={() => window.dispatchEvent(new Event(SYNC_NOW_EVENT))}>
        Sync with Submittable now
      </MenuButton>
    </Menu>
  );
}
