import { useCallback, useRef } from 'react';
import type { ZoomState } from './types';

type SetZoom = (updater: (z: ZoomState) => ZoomState) => void;

export function usePinchZoom(
  containerRef: React.RefObject<HTMLElement>,
  zoom: ZoomState,
  setZoom: SetZoom,
  getDayHeightPx: (z: ZoomState) => number,
  getPivotClientY: (e: WheelEvent | TouchEvent) => number | null,
) {
  const lastDistanceRef = useRef<number | null>(null);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const applyZoom = useCallback((delta: number, pivotClientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const oldZoom = zoom;
    const oldDayHeight = getDayHeightPx(oldZoom);
    const rect = container.getBoundingClientRect();
    const pivotY = pivotClientY - rect.top;
    const scrollTop = container.scrollTop;

    const timeFraction = (scrollTop + pivotY) / oldDayHeight % 1; // fraction within day (0..1)

    // Keep line spacing (rowHeightPx) constant; change granularity via slotsPerDay
    // Allowed hour steps: 1h, 2h, 4h, 6h, 8h → slots per day: 24, 12, 6, 4, 3
    const allowedSlots = [24, 12, 6, 4, 3];
    const currentIndex = allowedSlots.findIndex((s) => s === oldZoom.slotsPerDay);
    const idx = currentIndex === -1 ? 0 : currentIndex;
    const direction = delta > 0 ? -1 : 1; // positive delta = zoom in = more slots
    const threshold = 0.05;
    const nextIndex = Math.min(allowedSlots.length - 1, Math.max(0, idx + (Math.abs(delta) > threshold ? direction : 0)));
    const newSlots = allowedSlots[nextIndex];
    const newZoom: ZoomState = { ...oldZoom, slotsPerDay: newSlots };
    const newDayHeight = getDayHeightPx(newZoom);

    const dayIndex = Math.floor((scrollTop + pivotY) / oldDayHeight);
    const targetOffsetWithinDay = timeFraction * newDayHeight;
    const newScrollTop = dayIndex * newDayHeight + targetOffsetWithinDay - pivotY;

    setZoom(() => newZoom);
    requestAnimationFrame(() => {
      container.scrollTop = newScrollTop;
    });
  }, [containerRef, zoom, setZoom, getDayHeightPx]);

  const onWheel = useCallback((e: WheelEvent) => {
    // On non-touch environments: zoom with Shift + mouse wheel
    if (!e.shiftKey) return;
    e.preventDefault();
    const pivotY = getPivotClientY(e);
    if (pivotY == null) return;
    const delta = -e.deltaY * 0.001; // small step; negative to match typical zoom direction
    applyZoom(delta, pivotY);
  }, [applyZoom, getPivotClientY]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) {
      lastDistanceRef.current = null;
      return;
    }
    const [t1, t2] = [e.touches[0], e.touches[1]];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pivotY = (t1.clientY + t2.clientY) / 2;

    const last = lastDistanceRef.current;
    if (last != null) {
      const change = (dist - last) / last; // relative change
      if (Math.abs(change) > 0.002) {
        e.preventDefault();
        applyZoom(change, pivotY);
      }
    }
    lastDistanceRef.current = dist;
  }, [applyZoom]);

  const onTouchEnd = useCallback(() => {
    lastDistanceRef.current = null;
  }, []);

  return { onWheel, onTouchMove, onTouchEnd };
}


