export interface Mission {
  _id: string;
  name: string;
  userId: string;
  minLength?: number;
  maxLength?: number;
  propertyFilters: Record<string, { required: boolean; value: boolean }>;
  schedule: Record<string, { scheduled: boolean; startTime?: string; endTime?: string }>;
  repeatPatterns?: Record<string, {
    every: number;
    unit: 'day' | 'week' | 'month';
    scheduled: boolean;
    startTime?: string;
    endTime?: string;
  }>;
  repeatExceptions?: string[];
  _creationTime: number;
}

export type EffectiveSchedule = {
  scheduled: boolean;
  startTime?: string;
  endTime?: string;
} | undefined;

export interface ZoomState {
  rowHeightPx: number;
  minRowHeightPx: number;
  maxRowHeightPx: number;
  slotsPerDay: number; // typically 48 for 30min increments
}

export interface TimeSlot {
  index: number; // 0..slotsPerDay-1
  isHour: boolean;
  label: string; // e.g., "09:00"
}


