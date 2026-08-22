import { useSyncExternalStore } from 'react';

/** Tailwind's `md` breakpoint, the width at which a real table starts to fit. */
export const WIDE_QUERY = '(min-width: 48rem)';

/**
 * Tracks a CSS media query.
 *
 * Layouts that differ structurally between phone and desktop pick one here
 * instead of rendering both and hiding one: a phone should not pay to build
 * the desktop table it will never show, and a hidden duplicate is the usual
 * source of "the screen reader read every row twice".
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    // Without matchMedia (jsdom) assume the roomy layout, which is the one
    // component tests query against.
    () => window.matchMedia?.(query).matches ?? true,
    () => true,
  );
}

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
