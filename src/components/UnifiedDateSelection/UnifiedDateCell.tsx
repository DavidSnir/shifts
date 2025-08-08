import { useEffect, useState } from 'react';
import { TimeInput24 } from './TimeInput24';
import { getDayOfMonth, matchesRepeatPattern, matchesMissionRepeatPattern, matchesRuleRepeatPattern } from '../../utils/dateScheduling';

export type UnifiedKind = 'person' | 'mission' | 'rule';

export interface UnifiedCalendarCellProps {
  date: string;
  data: { _id: string } & Record<string, any>;
  type: UnifiedKind;
  effectiveData?: any;
  onUpdateSchedule?: (params: { id: string; date: string; scheduled: boolean; startTime?: string; endTime?: string }) => Promise<void>;
  onUpdateAvailability?: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>;
  // Deprecated with inline popup, kept for compatibility
  // onOpenRepeat?: (id: string, date: string, schedule: { scheduled: boolean; startTime?: string; endTime?: string }) => void;
  // onOpenRemoveRepeat?: (id: string, date: string) => void;
  onAddRepeatPattern?: (params: { id: string; startDate: string; every: number; unit: 'day' | 'week' | 'month'; scheduled?: boolean; unavailable?: boolean; startTime?: string; endTime?: string; }) => Promise<void>;
  onRemoveRepeatPattern?: (params: { id: string; startDate: string }) => Promise<void>;
  onAddRepeatException?: (params: { id: string; date: string }) => Promise<void>;
  onStopFutureRepeats?: (params: { id: string; startDate: string; customStopFromDate: string }) => Promise<void>;
  isToday?: boolean;
}

export function UnifiedDateCell({
  date,
  data,
  type,
  effectiveData,
  onUpdateSchedule,
  onUpdateAvailability,
  // onOpenRepeat,
  // onOpenRemoveRepeat,
  onAddRepeatPattern,
  onRemoveRepeatPattern,
  onAddRepeatException,
  onStopFutureRepeats,
  isToday: isTodayProp = false
}: UnifiedCalendarCellProps) {
  const [isFullDay, setIsFullDay] = useState(() => {
    if (type === 'person') {
      const isEmptyStrings = (effectiveData?.startTime === '' || !effectiveData?.startTime) && (effectiveData?.endTime === '' || !effectiveData?.endTime);
      const isFullDayTimes = effectiveData?.startTime === '00:00' && effectiveData?.endTime === '23:59';
      return isEmptyStrings || isFullDayTimes;
    } else {
      const isEmptyStrings = !effectiveData?.startTime && !effectiveData?.endTime;
      const isFullDayTimes = effectiveData?.startTime === '00:00' && effectiveData?.endTime === '23:59';
      return isEmptyStrings || isFullDayTimes;
    }
  });
  const [localStartTime, setLocalStartTime] = useState(effectiveData?.startTime || '');
  const [localEndTime, setLocalEndTime] = useState(effectiveData?.endTime || '');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<'day' | 'week' | 'month'>('week');
  const [confirmRemoveRepeat, setConfirmRemoveRepeat] = useState(false);

  useEffect(() => {
    if (effectiveData) {
      setLocalStartTime(effectiveData?.startTime || '');
      setLocalEndTime(effectiveData?.endTime || '');
      const isEmptyStrings = (effectiveData?.startTime === '' || !effectiveData?.startTime) && (effectiveData?.endTime === '' || !effectiveData?.endTime);
      const isFullDayTimes = effectiveData?.startTime === '00:00' && effectiveData?.endTime === '23:59';
      setIsFullDay(isEmptyStrings || isFullDayTimes);
    }
  }, [effectiveData, date, type]);

  const isActive = type === 'person' ? effectiveData?.unavailable : effectiveData?.scheduled;
  const dayNumber = getDayOfMonth(date);
  const monthNum = (() => { const d = new Date(date + 'T00:00:00'); return d.getMonth() + 1; })();
  const ddmm = `${String(dayNumber).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}`;

  const handleToggle = async () => {
    const newActive = !isActive;
    if (newActive) {
      setIsFullDay(true);
      setLocalStartTime('');
      setLocalEndTime('');
      if (type === 'person' && onUpdateAvailability) {
        await onUpdateAvailability(data._id, date, true, '', '');
      } else if (onUpdateSchedule) {
        await onUpdateSchedule({ id: data._id, date, scheduled: true, startTime: '', endTime: '' });
      }
    } else {
      // Determine if this date is the origin of a repeat pattern by key presence (more reliable than effectiveData)
      const isOriginByKey = !!(data.repeatPatterns && (data.repeatPatterns as any)[date]);
      // If this cell is the origin of a repeat pattern, remove the entire pattern immediately
      if (isOriginByKey) {
        if (onRemoveRepeatPattern) {
          await onRemoveRepeatPattern({ id: data._id as any, startDate: date });
        }
        // Also set this date inactive explicitly
        if (type === 'person' && onUpdateAvailability) {
          await onUpdateAvailability(data._id, date, false);
        } else if (onUpdateSchedule) {
          await onUpdateSchedule({ id: data._id, date, scheduled: false });
        }
        return;
      }
      if (effectiveData?.isRepeated && effectiveData?.originalStartDate) {
        setConfirmRemoveRepeat(true);
        return;
      } else {
        if (type === 'person' && onUpdateAvailability) {
          await onUpdateAvailability(data._id, date, false);
        } else if (onUpdateSchedule) {
          await onUpdateSchedule({ id: data._id, date, scheduled: false });
        }
      }
    }
  };

  const handleTimeUpdate = () => {
    if (isActive) {
      const startTime = isFullDay ? '' : (localStartTime || '');
      const endTime = isFullDay ? '' : (localEndTime || '');
      if (type === 'person' && onUpdateAvailability) {
        onUpdateAvailability(data._id, date, true, startTime, endTime);
      } else if (onUpdateSchedule) {
        onUpdateSchedule({ id: data._id, date, scheduled: true, startTime, endTime });
      }
    }
  };

  const handleModeSwitch = (fullDay: boolean) => {
    setIsFullDay(fullDay);
    if (fullDay) {
      setLocalStartTime('');
      setLocalEndTime('');
      if (isActive) {
        if (type === 'person' && onUpdateAvailability) {
          onUpdateAvailability(data._id, date, true, '', '');
        } else if (onUpdateSchedule) {
          onUpdateSchedule({ id: data._id, date, scheduled: true, startTime: '', endTime: '' });
        }
      }
    } else {
      const start = '09:00';
      const end = '17:00';
      setLocalStartTime(start);
      setLocalEndTime(end);
      if (isActive) {
        if (type === 'person' && onUpdateAvailability) {
          onUpdateAvailability(data._id, date, true, start, end);
        } else if (onUpdateSchedule) {
          onUpdateSchedule({ id: data._id, date, scheduled: true, startTime: start, endTime: end });
        }
      }
    }
  };

  const applyEdits = async () => {
    const scheduled = type !== 'person';
    const unavailable = type === 'person';
    const startTime = isFullDay ? '' : (localStartTime || '');
    const endTime = isFullDay ? '' : (localEndTime || '');
    if (repeatEnabled && onAddRepeatPattern) {
      await onAddRepeatPattern({
        id: data._id as any,
        startDate: date,
        every: repeatEvery,
        unit: repeatUnit,
        scheduled: scheduled ? true : undefined,
        unavailable: unavailable ? true : undefined,
        startTime,
        endTime
      });
    } else {
      // Repeat disabled: remove existing pattern or stop future repeats if applicable
      const findPatternStart = () => {
        if (!data.repeatPatterns) return null as string | null;
        const keys = Object.keys(data.repeatPatterns as Record<string, any>);
        for (const start of keys) {
          if (type === 'person' && matchesRepeatPattern(date, start, (data.repeatPatterns as any)[start])) return start;
          if (type === 'mission' && matchesMissionRepeatPattern(date, start, (data.repeatPatterns as any)[start])) return start;
          if (type === 'rule' && matchesRuleRepeatPattern(date, start, (data.repeatPatterns as any)[start])) return start;
        }
        return null;
      };
      const patternStart = findPatternStart();
      if (patternStart) {
        if (patternStart === date) {
          if (onRemoveRepeatPattern) {
            await onRemoveRepeatPattern({ id: data._id as any, startDate: patternStart });
          }
        } else {
          if (onStopFutureRepeats) {
            await onStopFutureRepeats({ id: data._id as any, startDate: patternStart, customStopFromDate: date });
          }
        }
      }
    }
    if (type === 'person' && onUpdateAvailability) {
      await onUpdateAvailability(data._id, date, true, startTime, endTime);
    } else if (onUpdateSchedule) {
      await onUpdateSchedule({ id: data._id, date, scheduled: true, startTime, endTime });
    }
    setIsEditOpen(false);
  };

  const handleRemoveOnlyThisDate = async () => {
    if (onAddRepeatException) {
      await onAddRepeatException({ id: data._id as any, date });
    }
    setConfirmRemoveRepeat(false);
  };

  const handleRemoveThisAndFollowing = async () => {
    const patternStartDate = data.repeatPatterns ? Object.keys(data.repeatPatterns).find((startDate: string) => {
      if (type === 'person') return matchesRepeatPattern(date, startDate, (data.repeatPatterns as any)[startDate]);
      if (type === 'mission') return matchesMissionRepeatPattern(date, startDate, (data.repeatPatterns as any)[startDate]);
      if (type === 'rule') return matchesRuleRepeatPattern(date, startDate, (data.repeatPatterns as any)[startDate]);
      return false;
    }) : null;
    if (patternStartDate) {
      if (date === patternStartDate) {
        if (onRemoveRepeatPattern) await onRemoveRepeatPattern({ id: data._id as any, startDate: patternStartDate });
      } else {
        if (onStopFutureRepeats) await onStopFutureRepeats({ id: data._id as any, startDate: patternStartDate, customStopFromDate: date });
      }
    }
    setConfirmRemoveRepeat(false);
  };

  const cellBg = isActive ? '#000000' : (isTodayProp ? '#f0f0f0' : '#ffffff');
  const cellColor = isActive ? '#ffffff' : '#000000';

  return (
    <div onClick={handleToggle} style={{ backgroundColor: cellBg, color: cellColor, border: `1px solid ${isActive ? '#ffffff' : '#000000'}`, borderRadius: '0px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 'auto', position: 'relative', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: 1 }}>{ddmm}</span>
          {(effectiveData?.isRepeatOrigin || effectiveData?.isRepeated) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {effectiveData?.isRepeatOrigin && (
                <div title="Repeat origin" style={{ width: '16px', height: '16px', border: '2px solid #000000', backgroundColor: '#0066ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 'bold', fontSize: '10px' }}>O</div>
              )}
              {effectiveData?.isRepeated && (
                <div title="Repeating" style={{ width: '16px', height: '16px', border: '2px solid #000000', backgroundColor: '#ff6600', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 'bold', fontSize: '10px' }}>R</div>
              )}
            </div>
          )}
        </div>
        {/* Removed right-side checkbox visual to keep the cell clean */}
      </div>

      {isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }}
          title="Edit"
          style={{ position: 'absolute', top: '6px', right: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', color: '#ffffff', border: 'none', borderRadius: '0px', cursor: 'pointer', zIndex: 12, padding: 0, margin: 0, fontSize: '16px', lineHeight: 1, width: 'auto', height: 'auto', minWidth: 0, minHeight: 0 }}
          aria-label="Edit day"
        >
          ✎
        </button>
      )}

      {isEditOpen && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, cursor: 'default' }}>
          <div style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000', padding: '16px', display: 'grid', gap: '10px', width: '90%', maxWidth: '320px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>EDIT DAY</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>All Day</span>
              <div style={{ width: '20px', height: '20px', border: '1px solid #000000', backgroundColor: isFullDay ? '#000000' : '#ffffff', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleModeSwitch(!isFullDay)}>
                {isFullDay && <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
              </div>
            </div>

            {!isFullDay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TimeInput24 value={localStartTime} onChange={setLocalStartTime} onBlur={handleTimeUpdate} />
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>→</span>
                <TimeInput24 value={localEndTime} onChange={setLocalEndTime} onBlur={handleTimeUpdate} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '18px', height: '18px', border: '1px solid #000000', backgroundColor: repeatEnabled ? '#000000' : '#ffffff', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: repeatEnabled ? '#ffffff' : '#000000', fontWeight: 'bold', fontSize: '12px' }} onClick={() => setRepeatEnabled(!repeatEnabled)}>
                  {repeatEnabled ? '✓' : ''}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Repeat</span>
              </div>
              {repeatEnabled && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="number" min={1} value={repeatEvery} onChange={(e) => setRepeatEvery(Math.max(1, Number(e.target.value)))} style={{ width: '56px', border: '1px solid #000000', padding: '4px', textAlign: 'center' }} />
                  <select value={repeatUnit} onChange={(e) => setRepeatUnit(e.target.value as any)} style={{ border: '1px solid #000000', padding: '4px' }}>
                    <option value="day">days</option>
                    <option value="week">weeks</option>
                    <option value="month">months</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={applyEdits} style={{ flex: 1, fontWeight: 'bold', padding: '10px', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000', cursor: 'pointer' }}>APPLY</button>
              <button onClick={() => setIsEditOpen(false)} style={{ flex: 1, fontWeight: 'bold', padding: '10px', backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveRepeat && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10001, cursor: 'default' }}>
          <div style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000', padding: '16px', display: 'grid', gap: '10px', width: '90%', maxWidth: '320px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>REMOVE REPEAT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleRemoveOnlyThisDate} style={{ fontSize: '12px', fontWeight: 'bold', padding: '10px', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000', cursor: 'pointer' }}>REMOVE ONLY THIS DATE</button>
              <button onClick={handleRemoveThisAndFollowing} style={{ fontSize: '12px', fontWeight: 'bold', padding: '10px', backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000', cursor: 'pointer' }}>REMOVE THIS DATE AND ALL FOLLOWING</button>
              <button onClick={() => setConfirmRemoveRepeat(false)} style={{ fontSize: '12px', fontWeight: 'bold', padding: '10px', backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


