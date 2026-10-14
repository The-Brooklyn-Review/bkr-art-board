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
