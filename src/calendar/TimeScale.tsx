import React from 'react';
import type { ZoomState, TimeSlot } from './types';

function buildTimeSlots(slotsPerDay: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let i = 0; i < slotsPerDay; i++) {
    const minutes = i * (24 * 60 / slotsPerDay);
    const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
    const mm = Math.floor(minutes % 60).toString().padStart(2, '0');
    const isHour = mm === '00';
    const hour = parseInt(hh, 10);
    const minute = parseInt(mm, 10);
    slots.push({ index: i, isHour, label: `${hh}:${mm}`, hour, minute });
  }
  return slots;
}

export function TimeScale({ zoom }: { zoom: ZoomState }) {
  const slots = React.useMemo(() => buildTimeSlots(zoom.slotsPerDay), [zoom.slotsPerDay]);
  const rowH = zoom.rowHeightPx;

  // Determine hour labeling interval based on slotsPerDay
  const hourStep = React.useMemo(() => {
    switch (zoom.slotsPerDay) {
      case 24: return 1; // 1h per slot
      case 12: return 2; // 2h per slot
      case 6: return 4;  // 4h per slot
      case 4: return 6;  // 6h per slot
      case 3: return 8;  // 8h per slot
      default: return Math.max(1, Math.round(24 / zoom.slotsPerDay));
    }
  }, [zoom.slotsPerDay]);

  return (
    <div style={{ position: 'sticky', left: 0, top: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {slots.map((slot) => {
          const showLabel = slot.isHour && (slot.hour % hourStep === 0);
          const isMajor = showLabel;
          return (
            <div
              key={slot.index}
              style={{
                height: rowH,
                borderBottom: slot.isHour ? '2px solid #000' : '1px solid #ddd',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'flex-start',
                paddingTop: 2,
                paddingLeft: 6,
                fontSize: 10,
                fontWeight: isMajor ? 700 : 400,
                background: '#fff',
              }}
            >
              {showLabel ? slot.label : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}


