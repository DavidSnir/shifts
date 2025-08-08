import React from 'react';
import type { Mission, ZoomState } from './types';
import { TimeScale } from './TimeScale';
import { DayGrid } from './DayGrid';
// Zoom via gestures removed; spacing is controlled via settings UI
import { useStickyDate } from './useStickyDate';

function toISO(d: Date) { return d.toISOString().split('T')[0]; }

const INITIAL_BEFORE = 5;
const INITIAL_AFTER = 5;
const LOAD_CHUNK = 5;
const MAX_DAYS = 90; // clamp to avoid unbounded DOM growth
const HEADER_HEIGHT_PX = 36; // mission header under sticky date

function buildDaysAround(anchorISO: string, before = INITIAL_BEFORE, after = INITIAL_AFTER): string[] {
  const base = new Date(anchorISO + 'T00:00:00');
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(toISO(d));
  }
  return out;
}

export function CalendarDayScroller({
  selectedDate,
  onDateChange,
  missions,
  onJumpToToday,
}: {
  selectedDate: string;
  onDateChange: (iso: string) => void;
  missions: Mission[] | undefined;
  onJumpToToday: () => void;
}) {
  const [days, setDays] = React.useState<string[]>(() => buildDaysAround(selectedDate));
  const [visibleRange, setVisibleRange] = React.useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [zoom, setZoom] = React.useState<ZoomState>({
    rowHeightPx: 28,
    minRowHeightPx: 12,
    maxRowHeightPx: 80,
    slotsPerDay: 48,
  });
  const [showSettings, setShowSettings] = React.useState(false);

  const getDayHeightPx = React.useCallback((z: ZoomState) => z.slotsPerDay * z.rowHeightPx, []);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerScrollRef = React.useRef<HTMLDivElement>(null);
  const horizontalScrollLeftRef = React.useRef<number>(0);
  const isSyncingHorizontalRef = React.useRef<boolean>(false);
  const horizontalContainersRef = React.useRef<Set<HTMLDivElement>>(new Set());

  const dayHeight = getDayHeightPx(zoom); // per-day height is just the timetable height
  // Use the first loaded day as the sticky base; no offset because titles are outside the scroll container
  const stickyISO = useStickyDate(containerRef, (days[0] ?? selectedDate), dayHeight, 0);
  // Reflect sticky date to the parent without forcing a days reset
  const lastSentStickyRef = React.useRef<string>('');
  const suppressSyncUntilRef = React.useRef<number>(0);
  React.useEffect(() => {
    const now = performance.now();
    if (now < suppressSyncUntilRef.current) return;
    if (stickyISO && stickyISO !== lastSentStickyRef.current) {
      lastSentStickyRef.current = stickyISO;
      onDateChange(stickyISO);
    }
  }, [stickyISO, onDateChange]);

  const getPivotClientY = React.useCallback((e: WheelEvent | TouchEvent) => {
    if ('ctrlKey' in e) {
      const wheel = e as WheelEvent;
      return wheel.clientY;
    }
    const touch = e as TouchEvent;
    if (touch.touches.length === 2) {
      return (touch.touches[0].clientY + touch.touches[1].clientY) / 2;
    }
    return null;
  }, []);

  // Removed gesture zoom; spacing controlled via settings

  // Prevent rapid, repeated buffer extensions during a single scroll burst
  const extendCooldownRef = React.useRef<number>(0);
  const OVERSCAN_DAYS = 2;

  // Helper to mark programmatic scrolls to suppress parent sync briefly
  const markProgrammaticScroll = React.useCallback((cb: () => void) => {
    suppressSyncUntilRef.current = performance.now() + 400;
    cb();
  }, []);

  const updateVisibleRange = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / dayHeight) - OVERSCAN_DAYS);
    const end = Math.min(
      Math.max(0, days.length - 1),
      Math.floor((el.scrollTop + el.clientHeight) / dayHeight) + OVERSCAN_DAYS
    );
    setVisibleRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [dayHeight, days.length]);

  // Horizontal scroll sync between header and each day's mission grid
  const syncHorizontalScroll = React.useCallback((source: HTMLDivElement | null, scrollLeft: number) => {
    if (isSyncingHorizontalRef.current) return;
    isSyncingHorizontalRef.current = true;
    horizontalScrollLeftRef.current = scrollLeft;

    const headerEl = headerScrollRef.current;
    if (headerEl && headerEl !== source) {
      headerEl.scrollLeft = scrollLeft;
    }
    horizontalContainersRef.current.forEach((el) => {
      if (el !== source) {
        el.scrollLeft = scrollLeft;
      }
    });
    // Allow microtask queue to flush layout before unlocking to avoid jitter
    requestAnimationFrame(() => {
      isSyncingHorizontalRef.current = false;
    });
  }, []);

  const onHeaderHorizontalScroll = React.useCallback(() => {
    const el = headerScrollRef.current;
    if (!el) return;
    if (isSyncingHorizontalRef.current) return;
    syncHorizontalScroll(el, el.scrollLeft);
  }, [syncHorizontalScroll]);

  const registerDayHorizontalContainer = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    horizontalContainersRef.current.add(el);
    const onScroll = () => {
      if (isSyncingHorizontalRef.current) return;
      syncHorizontalScroll(el, el.scrollLeft);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Initialize with the latest known scrollLeft
    requestAnimationFrame(() => {
      el.scrollLeft = horizontalScrollLeftRef.current;
    });
    // Cleanup when element is removed from DOM
    const observer = new MutationObserver(() => {
      if (!document.body.contains(el)) {
        el.removeEventListener('scroll', onScroll as any);
        horizontalContainersRef.current.delete(el);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, [syncHorizontalScroll]);

  // Always rebuild around the selected date and center it in view
  React.useEffect(() => {
    setDays(buildDaysAround(selectedDate));
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      markProgrammaticScroll(() => { el.scrollTop = 5 * dayHeight; });
      requestAnimationFrame(() => updateVisibleRange());
    });
  }, [selectedDate, dayHeight]);

  const prependDays = React.useCallback((count: number) => {
    setDays((prev) => {
      const first = prev[0];
      const base = new Date(first + 'T00:00:00');
      const added: string[] = [];
      for (let i = count; i >= 1; i--) {
        const d = new Date(base);
        d.setDate(base.getDate() - i);
        added.push(toISO(d));
      }
      let next = [...added, ...prev];
      // Trim from end if we exceed MAX_DAYS when prepending
      if (next.length > MAX_DAYS) {
        next = next.slice(0, MAX_DAYS);
      }
      return next;
    });
    const el = containerRef.current;
    if (el) markProgrammaticScroll(() => { el.scrollTop += count * dayHeight; });
  }, [dayHeight]);

  const appendDays = React.useCallback((count: number) => {
    let removedFromStart = 0;
    setDays((prev) => {
      const last = prev[prev.length - 1];
      const base = new Date(last + 'T00:00:00');
      const added: string[] = [];
      for (let i = 1; i <= count; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        added.push(toISO(d));
      }
      let next = [...prev, ...added];
      if (next.length > MAX_DAYS) {
        removedFromStart = next.length - MAX_DAYS;
        next = next.slice(removedFromStart);
      }
      return next;
    });
    if (removedFromStart > 0) {
      const el = containerRef.current;
      if (el) {
        requestAnimationFrame(() => {
          markProgrammaticScroll(() => { el.scrollTop += removedFromStart * dayHeight; });
        });
      }
    }
  }, []);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now < extendCooldownRef.current) return;

    const el = e.currentTarget;
    let extended = false;
    if (el.scrollTop < 3 * dayHeight) {
      prependDays(LOAD_CHUNK);
      extended = true;
    }
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 3 * dayHeight) {
      appendDays(LOAD_CHUNK);
      extended = true;
    }
    if (extended) {
      extendCooldownRef.current = now + 120; // ~1 frame or two depending on device
    }
    updateVisibleRange();
  }, [appendDays, prependDays, dayHeight, updateVisibleRange]);

  // Initialize visible range after mount and whenever zoom/day list changes
  React.useEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange, dayHeight, days.length]);

  // Center the initial view on the selected date to avoid starting at the earliest (past) day
  const hasInitializedRef = React.useRef(false);
  React.useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      extendCooldownRef.current = performance.now() + 400;
      markProgrammaticScroll(() => { el.scrollTop = 5 * dayHeight; });
      requestAnimationFrame(() => updateVisibleRange());
    });
  }, [dayHeight, updateVisibleRange, markProgrammaticScroll]);

  // Persist zoom level (row height) locally so it survives refreshes
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('calendar.rowHeightPx');
      if (saved) {
        const n = Number(saved);
        if (!Number.isNaN(n) && n >= 8 && n <= 120) {
          setZoom((z) => ({ ...z, rowHeightPx: n }));
        }
      }
      const savedSlots = localStorage.getItem('calendar.slotsPerDay');
      if (savedSlots) {
        const s = Number(savedSlots);
        if ([24, 12, 6, 4, 3, 2, 1].includes(s)) setZoom((z) => ({ ...z, slotsPerDay: s }));
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('calendar.rowHeightPx', String(zoom.rowHeightPx));
      localStorage.setItem('calendar.slotsPerDay', String(zoom.slotsPerDay));
    } catch {}
  }, [zoom.rowHeightPx]);

  React.useEffect(() => {
    try {
      localStorage.setItem('calendar.slotsPerDay', String(zoom.slotsPerDay));
    } catch {}
  }, [zoom.slotsPerDay]);

  const applySlotsPerDay = React.useCallback((newSlots: number) => {
    const container = containerRef.current;
    if (!container) {
      setZoom((z) => ({ ...z, slotsPerDay: newSlots }));
      return;
    }
    const oldDayHeight = getDayHeightPx(zoom);
    const indexFloat = container.scrollTop / oldDayHeight;
    const newZoom = { ...zoom, slotsPerDay: newSlots };
    const newDayHeight = getDayHeightPx(newZoom);
    setZoom(() => newZoom);
    requestAnimationFrame(() => {
      container.scrollTop = indexFloat * newDayHeight;
      updateVisibleRange();
    });
  }, [zoom, getDayHeightPx, updateVisibleRange]);

  const formatShortDate = React.useMemo(() => {
    const [year, month, day] = stickyISO.split('-');
    return `${day}/${month}/${year.slice(2)}`;
  }, [stickyISO]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Global sticky header: only the column titles row */}
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#fff', borderBottom: '1px solid #000' }}>
        {/* Column titles: [current date] + [mission names...] aligned with the grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd', background: '#fff' }}>
          {/* First column: current date label (clickable to jump to today) */}
          <div style={{ padding: '6px 8px', borderRight: '1px solid #ddd', fontWeight: 700, fontSize: 12, cursor: 'pointer' }} onClick={onJumpToToday} title="Jump to Today">
            {formatShortDate}
          </div>
          {/* Mission titles grid with horizontal scroll (synced) */}
          <div
            ref={headerScrollRef}
            onScroll={onHeaderHorizontalScroll}
            style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px 0' }}
          >
            <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(120px, 1fr)' }}>
              {(missions || []).map((m) => (
                <div key={m._id} style={{ padding: '0 6px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{m.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative', background: '#fff' }}
      >
        {/* Render days as seamless stacked panels */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {showSettings && (
            <div style={{ position: 'absolute', left: 8, top: 8, border: '1px solid #000', background: '#fff', padding: 8, zIndex: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Spacing</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[24, 12, 6, 4, 3].map((s) => (
                  <button key={s} onClick={() => applySlotsPerDay(s)} style={{ border: '1px solid #000', background: zoom.slotsPerDay === s ? '#000' : '#fff', color: zoom.slotsPerDay === s ? '#fff' : '#000', padding: '2px 6px', cursor: 'pointer' }}>
                    {24 / s}h
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Top spacer */}
          {visibleRange.start > 0 && (
            <div style={{ height: visibleRange.start * dayHeight }} />
          )}

          {/* Render only visible days */}
          {days.slice(visibleRange.start, visibleRange.end + 1).map((iso) => (
            <div key={iso} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', height: dayHeight }}>
              {/* Left gutter */}
              <div
                style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, cursor: 'pointer' }}
                onClick={() => setShowSettings(true)}
                onMouseDown={(e) => e.stopPropagation()}
                title="Open spacing settings"
              >
                <TimeScale zoom={zoom} />
              </div>
              {/* Grid for missions */}
              <div style={{ borderLeft: '1px solid #000' }}>
                <DayGrid
                  date={iso}
                  missions={missions}
                  zoom={zoom}
                  onScrollContainerReady={registerDayHorizontalContainer}
                />
              </div>
            </div>
          ))}

          {/* Bottom spacer */}
          {visibleRange.end < days.length - 1 && (
            <div style={{ height: Math.max(0, (days.length - 1 - visibleRange.end) * dayHeight) }} />
          )}
        </div>
      </div>

      {/* Settings overlay (fixed, above all) */}
      {showSettings && (
        <>
          <div
            onClick={() => setShowSettings(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              border: '1px solid #000',
              background: '#fff',
              padding: 8,
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Spacing</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 4, 8, 12, 24].map((hours) => {
                const slots = Math.max(1, Math.round(24 / hours));
                const isActive = zoom.slotsPerDay === slots;
                return (
                  <button key={hours} onClick={() => applySlotsPerDay(slots)} style={{ border: '1px solid #000', background: isActive ? '#000' : '#fff', color: isActive ? '#fff' : '#000', padding: '2px 6px', cursor: 'pointer' }}>
                    {hours}h
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


