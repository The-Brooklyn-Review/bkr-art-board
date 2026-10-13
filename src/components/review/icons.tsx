// One small line-icon set, drawn on the same 16px grid with the same
// stroke, so arrows, chevrons and carets match wherever they appear
// (instead of text glyphs like ‹ › ← ↗, which vary by font and size).

type IconProps = { className?: string };

function Svg({ className = "w-3.5 h-3.5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

const CHEVRON: Record<"up" | "down" | "left" | "right", string> = {
  down: "M4 6l4 4 4-4",
  up: "M4 10l4-4 4 4",
  left: "M10 4L6 8l4 4",
  right: "M6 4l4 4-4 4",
};

export function ChevronIcon({
  dir,
  className,
}: IconProps & { dir: "up" | "down" | "left" | "right" }) {
  return (
    <Svg className={className}>
      <path d={CHEVRON[dir]} />
    </Svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </Svg>
  );
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3.5h6.5V10M12.5 3.5L4 12" />
    </Svg>
  );
}
