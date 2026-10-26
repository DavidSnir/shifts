import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  people: defineTable({
    name: v.string(),
    userId: v.string(),
    properties: v.any(), // dynamic field names -> boolean values
    propertyNames: v.any(), // field names -> display names (for non-ASCII support)
    availability: v.any(), // date -> { unavailable: boolean, startTime?: string, endTime?: string }
    repeatPatterns: v.optional(v.any()), // date -> { every: number, unit: 'day'|'week'|'month', unavailable: boolean, startTime?: string, endTime?: string }
    repeatExceptions: v.optional(v.array(v.string())), // dates that should be excluded from repeats
    _creationTime: v.number(),
  }),
  
  missions: defineTable({
    name: v.string(),
    userId: v.string(),
    minLength: v.optional(v.number()), // Minimum length of mission (required for new missions)
    maxLength: v.optional(v.number()), // Maximum length of mission (optional)
    propertyFilters: v.any(), // dynamic field names -> { required: boolean, value: boolean }
    schedule: v.any(), // date -> { scheduled: boolean, startTime?: string, endTime?: string }
    repeatPatterns: v.optional(v.any()), // date -> { every: number, unit: 'day'|'week'|'month', scheduled: boolean, startTime?: string, endTime?: string }
    repeatExceptions: v.optional(v.array(v.string())), // dates that should be excluded from repeats
    _creationTime: v.number(),
  }),
  
  rules: defineTable({
    name: v.string(),
    userId: v.string(),
    propertyFilters: v.any(), // dynamic field names -> { required: boolean, value: boolean }
    schedule: v.any(), // date -> { scheduled: boolean, startTime?: string, endTime?: string }
    repeatPatterns: v.optional(v.any()), // date -> { every: number, unit: 'day'|'week'|'month', scheduled: boolean, startTime?: string, endTime?: string }
    repeatExceptions: v.optional(v.array(v.string())), // dates that should be excluded from repeats
    _creationTime: v.number(),
  }),
  
  // Legacy table (keeping for backward compatibility)
  messages: defineTable({
    author: v.string(),
    body: v.string(),
  }),
}); 