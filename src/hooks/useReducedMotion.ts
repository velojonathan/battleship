import { useEffect, useState } from 'react';

/**
 * Returns true when the user has expressed a "reduced motion" preference via
 * the `prefers-reduced-motion: reduce` media query.
 *
 * Used by components that gate decorative animations programmatically
 * (e.g. transient cell flashes triggered via JS). Pure CSS animations are
 * already handled by `@media (prefers-reduced-motion: reduce)` rules in the
 * stylesheets.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }
    // Older Safari fallback.
    mql.addListener(listener);
    return () => mql.removeListener(listener);
  }, []);

  return reduced;
}
