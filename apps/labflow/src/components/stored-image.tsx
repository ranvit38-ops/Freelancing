'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * An uploaded image that says so plainly when it cannot be shown (its stored
 * copy is gone, or access was removed) instead of a broken-picture icon.
 */
export function StoredImage({
  src,
  alt,
  className,
  loading,
  onLoad,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image that failed before the page's scripts attached never fires
  // onError, so check once on mount as well.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) {
    return (
      <span className="mt-1 inline-block rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
        {alt} cannot be shown. It may no longer be stored; open it to see why.
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private, authenticated file; next/image would proxy it
    <img ref={ref} src={src} alt={alt} loading={loading} onLoad={onLoad} onError={() => setFailed(true)} className={className} />
  );
}
