import { useCallback, useEffect, useState } from 'react';

// Computes a sticky date label based on the current scroll position.
// "baseISO" should be the ISO date corresponding to scrollTop === 0,
// typically the first date in the loaded days array. This avoids re-basing
// while the user scrolls and prevents feedback loops.
export function useStickyDate(
  containerRef: React.RefObject<HTMLElement | null>,
  baseISO: string,
  dayHeightPx: number,
  offsetTopPx: number = 0,
  onDateChange?: (iso: string) => void,
) {
  const [visibleISO, setVisibleISO] = useState(baseISO);

  const toISO = (d: Date) => {
    // Use local date to avoid timezone off-by-one when close to midnight UTC
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const computeISOAtScrollTop = useCallback(
    (scrollTop: number) => {
      // Offset is for cases where part of the day height is visually hidden by a sticky overlay
      const adjusted = Math.max(0, scrollTop - offsetTopPx);
      const dayIndex = Math.round(adjusted / dayHeightPx);
      const base = new Date(baseISO + 'T00:00:00');
      const d = new Date(base);
      d.setDate(base.getDate() + dayIndex);
      return toISO(d);
    },
    [baseISO, dayHeightPx, offsetTopPx]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      const iso = computeISOAtScrollTop(container.scrollTop);
      if (iso !== visibleISO) {
        setVisibleISO(iso);
        onDateChange?.(iso);
      }
    };
    handler();
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler as any);
  }, [containerRef, computeISOAtScrollTop, onDateChange, visibleISO]);

  useEffect(() => {
    setVisibleISO(baseISO);
  }, [baseISO]);

  return visibleISO;
}


