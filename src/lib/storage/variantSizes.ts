// The thumbnail variants' sizes (see variants.ts) — no imports, so client
// components can use them without pulling in the R2 client.
export const VARIANTS = {
  // 64px rows at up to 3x pixel density.
  tiny: { size: 240 },
  // A ~300px card at 2x.
  card: { size: 600 },
} as const;

export type Variant = keyof typeof VARIANTS;
