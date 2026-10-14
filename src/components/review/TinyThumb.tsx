"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small square image (review list rows, the reviewer's page strip). Shows
 * the tiny variant and falls back to the regular thumbnail if it hasn't
 * been generated for this artwork (see src/lib/storage/variants.ts).
 */
export function TinyThumb({
  tinyUrl,
  thumbnailUrl,
  eager = false,
  className = "",
}: {
  tinyUrl: string | null;
  thumbnailUrl: string;
  eager?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState(tinyUrl ?? thumbnailUrl);
  const ref = useRef<HTMLImageElement>(null);
  const fallBack = () => setSrc(thumbnailUrl);

  // An image that failed before hydration never fires onError for React.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) fallBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      onError={src === thumbnailUrl ? undefined : fallBack}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`w-full h-full object-cover ${className}`}
    />
  );
}
