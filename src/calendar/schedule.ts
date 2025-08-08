import type { EffectiveSchedule, Mission } from './types';

function toDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

export function getEffectiveMissionSchedule(mission: Mission, dateStr: string): EffectiveSchedule {
  if (!mission) return undefined;

  // 1) Direct schedule takes precedence
  const direct = mission.schedule?.[dateStr];
  if (direct) return direct;

  // 2) Evaluate repeat patterns if present and not excepted
  const exceptions = new Set(mission.repeatExceptions || []);
  if (mission.repeatPatterns) {
    const target = toDate(dateStr);

    for (const [startDate, pattern] of Object.entries(mission.repeatPatterns)) {
      const start = toDate(startDate);
      if (target < start) continue;

      const diffDays = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      let matches = false;
      if (pattern.unit === 'day') {
        matches = diffDays % pattern.every === 0;
      } else if (pattern.unit === 'week') {
        matches = diffDays % (pattern.every * 7) === 0;
      } else if (pattern.unit === 'month') {
        const sameDay = target.getDate() === start.getDate();
        if (sameDay) {
          const monthDiff = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
          matches = monthDiff % pattern.every === 0;
        }
      }

      if (matches && !exceptions.has(dateStr)) {
        if (pattern.scheduled) {
          return {
            scheduled: true,
            startTime: pattern.startTime,
            endTime: pattern.endTime,
          };
        } else {
          return { scheduled: false };
        }
      }
    }
  }

  // 3) Not scheduled for this date
  return undefined;
}


