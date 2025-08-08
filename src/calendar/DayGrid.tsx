import React from 'react';
import type { Mission, ZoomState } from './types';
import { getEffectiveMissionSchedule } from './schedule';

function parseTimeToMinutes(t?: string): number | null {
  if (!t) return null;
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function DayGrid({
  date,
  missions,
  zoom,
  onScrollContainerReady,
}: {
  date: string;
  missions: Mission[] | undefined;
  zoom: ZoomState;
  onScrollContainerReady?: (el: HTMLDivElement | null) => void;
}) {
  const rowH = zoom.rowHeightPx;
  const containerRef = React.useRef<HTMLDivElement>(null);

  const timelineHeight = zoom.slotsPerDay * rowH;

  React.useEffect(() => {
    onScrollContainerReady?.(containerRef.current);
    return () => onScrollContainerReady?.(null);
  }, [onScrollContainerReady]);

  return (
    <div style={{ display: 'flex', minWidth: 0 }}>
      {/* Time gutter is rendered outside by parent; this renders only the timetable for missions */}
      <div
        ref={containerRef}
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', flex: 1 }}
      >
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(120px, 1fr)' }}>
          {(missions || []).map((mission) => {
            const effective = getEffectiveMissionSchedule(mission, date);
            const startMin = parseTimeToMinutes(effective?.startTime);
            const endMin = parseTimeToMinutes(effective?.endTime);
            const hasTimes = startMin != null && endMin != null && endMin! > startMin!;

            let topPx = 0;
            let heightPx = timelineHeight; // default full day
            if (hasTimes) {
              const dayMinutes = 24 * 60;
              topPx = (startMin! / dayMinutes) * timelineHeight;
              heightPx = ((endMin! - startMin!) / dayMinutes) * timelineHeight;
            }

            return (
              <div key={mission._id} style={{ position: 'relative', height: timelineHeight, borderLeft: '1px solid #eee' }}>
                {/* rows background */}
                {Array.from({ length: zoom.slotsPerDay }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: i * rowH,
                      left: 0,
                      right: 0,
                      height: rowH,
                      borderBottom: (i % (zoom.slotsPerDay / 24) === 0) ? '2px solid #000' : '1px solid #eee',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}

                {/* scheduled block */}
                {effective?.scheduled && (
                  <div
                    style={{
                      position: 'absolute',
                      top: topPx,
                      left: 8,
                      right: 8,
                      height: Math.max(12, heightPx),
                      background: '#000',
                      color: '#fff',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                    }}
                  >
                    {/* block title removed per request */}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


