export interface Person {
  _id: string;
  name: string;
  userId: string;
  properties: Record<string, boolean>;
  propertyNames: Record<string, string>;
  availability: Record<string, { unavailable: boolean; startTime?: string; endTime?: string }>;
  repeatPatterns?: Record<string, {
    every: number;
    unit: 'day' | 'week' | 'month';
    unavailable: boolean;
    startTime?: string;
    endTime?: string;
  }>;
  repeatExceptions?: string[];
  _creationTime: number;
}

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

export interface Rule {
  _id: string;
  name: string;
  userId: string;
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


