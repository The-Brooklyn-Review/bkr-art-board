// Gallery grid density: how many columns each size (S/M/L) shows. Pure.

// Columns per size, by window width (each key: "up to this many px").
// M, the default, adds a column per step — one per row on a phone, two on
// a large phone or small tablet, and so on; S and L are a step denser or
// roomier.
export const DENSITY_BREAKPOINTS: Record<
  "compact" | "default" | "large",
  Record<string | number, number>
> = {
  compact: { default: 7, 1600: 6, 1280: 5, 960: 4, 640: 2 },
  default: { default: 6, 1600: 5, 1280: 4, 960: 3, 640: 2, 480: 1 },
  large: { default: 4, 1600: 3, 1280: 3, 960: 2, 640: 1 },
};

/** How many columns a size shows at a window width — react-masonry-css's
 * rule: the smallest breakpoint at or above the width, else "default". */
export function columnsAt(density: keyof typeof DENSITY_BREAKPOINTS, width: number): number {
  const map = DENSITY_BREAKPOINTS[density];
  const key = Object.keys(map)
    .filter((k) => k !== "default")
    .map(Number)
    .sort((a, b) => a - b)
    .find((k) => width <= k);
  return key === undefined ? map.default : map[key];
}

/**
 * The `sizes` attribute for a gallery card's image: its CSS width at each
 * breakpoint, so the browser can pick the 600px card image or the 1000px
 * thumbnail from the srcset for the screen it's on (2x on a Mac, 3x on an
 * iPhone). Mirrors the grid: page padding 16px a side below 640px and 24px
 * above, masonry columns with a 16px gutter (`-ml-4` on the grid, `pl-4`
 * on each column), so a card is (width − 2·padding + 16) / columns − 16.
 */
export function cardSizes(density: keyof typeof DENSITY_BREAKPOINTS): string {
  const map = DENSITY_BREAKPOINTS[density];
  const width = (cols: number, maxWidth: number | null) => {
    const inset = (maxWidth !== null && maxWidth <= 640 ? 2 * 16 : 2 * 24) - 16;
    return `calc((100vw - ${inset}px) / ${cols} - 16px)`;
  };
  const steps = Object.keys(map)
    .filter((k) => k !== "default")
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `(max-width: ${k}px) ${width(map[k], k)}`);
  return [...steps, width(map.default, null)].join(", ");
}
