import React, { useState } from 'react';
import { UnifiedDateCell } from './UnifiedDateCell';
import type { UnifiedKind } from './UnifiedDateCell';
import { getThreeWeeks, isToday, getEffectiveAvailability, getEffectiveMissionSchedule, getEffectiveRuleSchedule } from '../../utils/dateScheduling';

export interface UnifiedCalendarProps {
  title: string;
  data: any;
  type: UnifiedKind;
  onUpdateSchedule?: any;
  onUpdateAvailability?: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>;
  onAddRepeatPattern?: any;
  onRemoveRepeatPattern?: any;
  onAddRepeatException?: any;
  onStopFutureRepeats?: any;
}

export function UnifiedDateGrid({
  title,
  data,
  type,
  onUpdateSchedule,
  onUpdateAvailability,
  onAddRepeatPattern,
  onRemoveRepeatPattern,
  onAddRepeatException,
  onStopFutureRepeats
}: UnifiedCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  // Popups are now handled inside UnifiedDateCell via an inline Edit popup

  const { weekNumbers, dates } = getThreeWeeks(weekOffset);
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // Repeat application now happens inside the cell's Edit popup

  const getEffectiveData = (date: string) => {
    if (type === 'person') return getEffectiveAvailability(data, date);
    if (type === 'mission') return getEffectiveMissionSchedule(data, date);
    if (type === 'rule') return getEffectiveRuleSchedule(data, date);
    return undefined;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button onClick={() => setWeekOffset(weekOffset - 1)} style={{ fontSize: '28px', fontWeight: 900 as any, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>←</button>
        <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>{title}</div>
        <button onClick={() => setWeekOffset(weekOffset + 1)} style={{ fontSize: '28px', fontWeight: 900 as any, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>→</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(3, 1fr)', gap: '1px', border: '1px solid #000000', backgroundColor: '#000000', borderRadius: '0px' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '8px 4px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', borderRight: '1px solid #000000' }}>WEEK</div>
        {weekNumbers.map((weekNum) => (
          <div key={weekNum} style={{ backgroundColor: '#ffffff', padding: '8px 4px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>{weekNum}</div>
        ))}

        {dayNames.map((dayName, dayIndex) => (
          <React.Fragment key={`row-${dayName}`}>
            <div style={{ backgroundColor: '#ffffff', padding: '4px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #000000' }}>{dayName}</div>
            {dates.map((week, weekIndex) => {
              const date = week[dayIndex];
              return (
                <UnifiedDateCell
                  key={`${weekIndex}-${dayIndex}`}
                  date={date}
                  data={data}
                  type={type}
                  effectiveData={getEffectiveData(date)}
                  onUpdateSchedule={onUpdateSchedule}
                  onUpdateAvailability={onUpdateAvailability}
                  // Edit popup and remove repeat flows handled inside the cell
                  onAddRepeatPattern={onAddRepeatPattern}
                  onRemoveRepeatPattern={onRemoveRepeatPattern}
                  onAddRepeatException={onAddRepeatException}
                  onStopFutureRepeats={onStopFutureRepeats}
                  isToday={isToday(date)}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}


