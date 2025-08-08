// Shared date helpers and effective schedule/availability logic

export function getThreeWeeks(weekOffset: number = 0): { weekNumbers: number[]; dates: string[][] } {
  const today = new Date();

  const currentSunday = new Date(today);
  const dayOfWeek = today.getDay();
  currentSunday.setDate(today.getDate() - dayOfWeek);

  currentSunday.setDate(currentSunday.getDate() + (weekOffset * 7));

  const weeks: string[][] = [];
  const weekNumbers: number[] = [];

  for (let weekIndex = 0; weekIndex < 3; weekIndex++) {
    const weekStart = new Date(currentSunday);
    weekStart.setDate(currentSunday.getDate() + (weekIndex * 7));

    const weekNumber = getWeekNumber(weekStart);
    weekNumbers.push(weekNumber);

    const weekDates: string[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      weekDates.push(date.toISOString().split('T')[0]);
    }
    weeks.push(weekDates);
  }

  return { weekNumbers, dates: weeks };
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function isToday(dateString: string): boolean {
  return dateString === getTodayString();
}

export function getDayOfMonth(dateString: string): number {
  const date = new Date(dateString + 'T00:00:00');
  return date.getDate();
}

export function matchesRepeatPattern(date: string, startDate: string, pattern: { every: number; unit: 'day' | 'week' | 'month' }): boolean {
  const targetDate = new Date(date + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');

  if (targetDate <= patternStartDate) return false;

  const diffTime = targetDate.getTime() - patternStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (pattern.unit === 'day') {
    return diffDays % pattern.every === 0;
  } else if (pattern.unit === 'week') {
    return diffDays % (pattern.every * 7) === 0;
  } else if (pattern.unit === 'month') {
    const targetDay = targetDate.getDate();
    const startDay = patternStartDate.getDate();
    if (targetDay !== startDay) return false;

    const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + (targetDate.getMonth() - patternStartDate.getMonth());
    return monthDiff % pattern.every === 0;
  }

  return false;
}

export function matchesMissionRepeatPattern(date: string, startDate: string, pattern: { every: number; unit: 'day' | 'week' | 'month' }): boolean {
  const targetDate = new Date(date + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  if (targetDate <= patternStartDate) return false;
  const diffTime = targetDate.getTime() - patternStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (pattern.unit === 'day') return diffDays % pattern.every === 0;
  if (pattern.unit === 'week') return diffDays % (pattern.every * 7) === 0;
  if (pattern.unit === 'month') {
    const targetDay = targetDate.getDate();
    const startDay = patternStartDate.getDate();
    if (targetDay !== startDay) return false;
    const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + (targetDate.getMonth() - patternStartDate.getMonth());
    return monthDiff % pattern.every === 0;
  }
  return false;
}

export function matchesRuleRepeatPattern(date: string, startDate: string, pattern: { every: number; unit: 'day' | 'week' | 'month' }): boolean {
  const targetDate = new Date(date + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  if (targetDate <= patternStartDate) return false;
  const diffTime = targetDate.getTime() - patternStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (pattern.unit === 'day') return diffDays % pattern.every === 0;
  if (pattern.unit === 'week') return diffDays % (pattern.every * 7) === 0;
  if (pattern.unit === 'month') {
    const targetDay = targetDate.getDate();
    const startDay = patternStartDate.getDate();
    if (targetDay !== startDay) return false;
    const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + (targetDate.getMonth() - patternStartDate.getMonth());
    return monthDiff % pattern.every === 0;
  }
  return false;
}

// The following effective-state helpers are kept with broad types to avoid coupling here to UI-level types
export function getEffectiveAvailability(person: any, date: string): { unavailable: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean } | undefined {
  const isRepeatOrigin = person.repeatPatterns && person.repeatPatterns[date];

  if (isRepeatOrigin && person.availability[date]) {
    return {
      ...person.availability[date],
      isRepeated: false,
      isRepeatOrigin: true,
      isResetOrigin: true,
      originalStartDate: date,
      futureRepeatsStopped: hasFutureRepeatsStopped(person, date),
      wasBrokenFromPattern: false
    };
  }

  if (person.availability[date] && !isRepeatOrigin) {
    let wasBrokenFromPattern = false;
    if (person.repeatPatterns) {
      for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
        if (matchesRepeatPattern(date, startDate, pattern as any)) {
          wasBrokenFromPattern = true;
          break;
        }
      }
    }

    return {
      ...person.availability[date],
      isRepeated: false,
      isRepeatOrigin: false,
      isResetOrigin: false,
      originalStartDate: undefined,
      futureRepeatsStopped: false,
      wasBrokenFromPattern
    };
  }

  if (person.repeatExceptions?.includes(date) && !person.availability[date]) {
    return undefined;
  }

  if (person.repeatPatterns) {
    for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
      if (matchesRepeatPattern(date, startDate, pattern as any)) {
        const isThisTheOrigin = date === startDate;
        return {
          unavailable: (pattern as any).unavailable,
          startTime: (pattern as any).startTime === undefined ? '' : (pattern as any).startTime,
          endTime: (pattern as any).endTime === undefined ? '' : (pattern as any).endTime,
          isRepeated: !isThisTheOrigin,
          isRepeatOrigin: isThisTheOrigin,
          isResetOrigin: false,
          originalStartDate: startDate,
          futureRepeatsStopped: hasFutureRepeatsStopped(person, startDate),
          wasBrokenFromPattern: false
        };
      }
    }
  }

  return undefined;
}

export function getEffectiveMissionSchedule(mission: any, date: string): { scheduled: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean } | undefined {
  const isRepeatOrigin = mission.repeatPatterns && mission.repeatPatterns[date];

  if (isRepeatOrigin && mission.schedule[date]) {
    return {
      ...mission.schedule[date],
      isRepeated: false,
      isRepeatOrigin: true,
      isResetOrigin: true,
      originalStartDate: date,
      futureRepeatsStopped: hasFutureMissionRepeatsStopped(mission, date),
      wasBrokenFromPattern: false
    } as any;
  }

  if (mission.schedule[date] && !isRepeatOrigin) {
    let wasBrokenFromPattern = false;
    if (mission.repeatPatterns) {
      for (const [startDate, pattern] of Object.entries(mission.repeatPatterns)) {
        if (matchesMissionRepeatPattern(date, startDate, pattern as any)) {
          wasBrokenFromPattern = true;
          break;
        }
      }
    }
    return {
      ...mission.schedule[date],
      isRepeated: false,
      isRepeatOrigin: false,
      isResetOrigin: false,
      originalStartDate: undefined,
      futureRepeatsStopped: false,
      wasBrokenFromPattern
    } as any;
  }

  if (mission.repeatExceptions?.includes(date) && !mission.schedule[date]) {
    return undefined;
  }

  if (mission.repeatPatterns) {
    for (const [startDate, pattern] of Object.entries(mission.repeatPatterns)) {
      if (matchesMissionRepeatPattern(date, startDate, pattern as any)) {
        const isThisTheOrigin = date === startDate;
        return {
          scheduled: (pattern as any).scheduled,
          startTime: (pattern as any).startTime === undefined ? '' : (pattern as any).startTime,
          endTime: (pattern as any).endTime === undefined ? '' : (pattern as any).endTime,
          isRepeated: !isThisTheOrigin,
          isRepeatOrigin: isThisTheOrigin,
          isResetOrigin: false,
          originalStartDate: startDate,
          futureRepeatsStopped: hasFutureMissionRepeatsStopped(mission, startDate),
          wasBrokenFromPattern: false
        } as any;
      }
    }
  }

  return undefined;
}

export function getEffectiveRuleSchedule(rule: any, date: string): { scheduled: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean } | undefined {
  const isRepeatOrigin = rule.repeatPatterns && rule.repeatPatterns[date];

  if (isRepeatOrigin && rule.schedule[date]) {
    return {
      ...rule.schedule[date],
      isRepeated: false,
      isRepeatOrigin: true,
      isResetOrigin: true,
      originalStartDate: date,
      futureRepeatsStopped: hasFutureRuleRepeatsStopped(rule, date),
      wasBrokenFromPattern: false
    } as any;
  }

  if (rule.schedule[date] && !isRepeatOrigin) {
    let wasBrokenFromPattern = false;
    if (rule.repeatPatterns) {
      for (const [startDate, pattern] of Object.entries(rule.repeatPatterns)) {
        if (matchesRuleRepeatPattern(date, startDate, pattern as any)) {
          wasBrokenFromPattern = true;
          break;
        }
      }
    }
    return {
      ...rule.schedule[date],
      isRepeated: false,
      isRepeatOrigin: false,
      isResetOrigin: false,
      originalStartDate: undefined,
      futureRepeatsStopped: false,
      wasBrokenFromPattern
    } as any;
  }

  if (rule.repeatExceptions?.includes(date) && !rule.schedule[date]) {
    return undefined;
  }

  if (rule.repeatPatterns) {
    for (const [startDate, pattern] of Object.entries(rule.repeatPatterns)) {
      if (matchesRuleRepeatPattern(date, startDate, pattern as any)) {
        const isThisTheOrigin = date === startDate;
        return {
          scheduled: (pattern as any).scheduled,
          startTime: (pattern as any).startTime === undefined ? '' : (pattern as any).startTime,
          endTime: (pattern as any).endTime === undefined ? '' : (pattern as any).endTime,
          isRepeated: !isThisTheOrigin,
          isRepeatOrigin: isThisTheOrigin,
          isResetOrigin: false,
          originalStartDate: startDate,
          futureRepeatsStopped: hasFutureRuleRepeatsStopped(rule, startDate),
          wasBrokenFromPattern: false
        } as any;
      }
    }
  }

  return undefined;
}

function hasFutureRepeatsStopped(person: any, startDate: string): boolean {
  if (!person.repeatExceptions) return false;
  const patternStartDate = new Date(startDate + 'T00:00:00');
  const todayDate = new Date(getTodayString() + 'T00:00:00');
  for (const exceptionDate of person.repeatExceptions) {
    const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
    if (exceptionDateObj > todayDate) {
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return true;
    }
  }
  return false;
}

function hasFutureMissionRepeatsStopped(mission: any, startDate: string): boolean {
  if (!mission.repeatExceptions) return false;
  const patternStartDate = new Date(startDate + 'T00:00:00');
  const todayDate = new Date(getTodayString() + 'T00:00:00');
  for (const exceptionDate of mission.repeatExceptions) {
    const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
    if (exceptionDateObj > todayDate) {
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return true;
    }
  }
  return false;
}

function hasFutureRuleRepeatsStopped(rule: any, startDate: string): boolean {
  if (!rule.repeatExceptions) return false;
  const patternStartDate = new Date(startDate + 'T00:00:00');
  const todayDate = new Date(getTodayString() + 'T00:00:00');
  for (const exceptionDate of rule.repeatExceptions) {
    const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
    if (exceptionDateObj > todayDate) {
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) return true;
    }
  }
  return false;
}


