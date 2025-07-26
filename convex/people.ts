import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Helper function to create ASCII-safe keys from any text
function createSafeKey(text: string): string {
  // Create a simple hash from the text for a unique ASCII key
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `prop_${Math.abs(hash).toString(36)}`;
}

// Get all people
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    
    return await ctx.db
      .query("people")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();
  },
});

// Add a new person
export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    // Get existing properties from other people
    const existingPeople = await ctx.db
      .query("people")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();
    
    const properties = existingPeople.length > 0 
      ? existingPeople[0].properties || {}
      : {};
    
    const propertyNames = existingPeople.length > 0 
      ? existingPeople[0].propertyNames || {}
      : {};

    await ctx.db.insert("people", {
      name,
      userId: identity.subject,
      properties,
      propertyNames, // Store display names separately
      availability: {}, // Initialize empty availability calendar
      repeatPatterns: {}, // Initialize empty repeat patterns
      repeatExceptions: [] // Initialize empty repeat exceptions
    });
  },
});

// Update person name
export const updateName = mutation({
  args: { id: v.id("people"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(id, { name });
  },
});

// Update person property
export const updateProperty = mutation({
  args: { 
    id: v.id("people"), 
    propertyKey: v.string(), 
    value: v.boolean() 
  },
  handler: async (ctx, { id, propertyKey, value }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person) return;

    const updatedProperties = {
      ...person.properties,
      [propertyKey]: value
    };

    await ctx.db.patch(id, { properties: updatedProperties });
  },
});

// Update person availability for a specific date
export const updateAvailability = mutation({
  args: { 
    id: v.id("people"),
    date: v.string(), // ISO date string (YYYY-MM-DD)
    unavailable: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, date, unavailable, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person) return;

    const updatedAvailability = {
      ...person.availability,
      [date]: unavailable ? { unavailable, startTime, endTime } : undefined
    };

    // Remove the date entry if person is available (not unavailable)
    if (!unavailable) {
      delete updatedAvailability[date];
    }

    await ctx.db.patch(id, { availability: updatedAvailability });
  },
});

// Add a new property to ALL people
export const addProperty = mutation({
  args: { propertyName: v.string() },
  handler: async (ctx, { propertyName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const safeKey = createSafeKey(propertyName);

    const allPeople = await ctx.db
      .query("people")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();

    for (const person of allPeople) {
      const updatedProperties = {
        ...person.properties,
        [safeKey]: false // Use ASCII-safe key
      };
      
      const updatedPropertyNames = {
        ...person.propertyNames,
        [safeKey]: propertyName // Store display name separately
      };
      
      await ctx.db.patch(person._id, { 
        properties: updatedProperties,
        propertyNames: updatedPropertyNames
      });
    }
  },
});

// Remove a property from ALL people
export const removeProperty = mutation({
  args: { propertyKey: v.string() },
  handler: async (ctx, { propertyKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const allPeople = await ctx.db
      .query("people")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();

    for (const person of allPeople) {
      const updatedProperties = { ...person.properties };
      const updatedPropertyNames = { ...person.propertyNames };
      
      delete updatedProperties[propertyKey];
      delete updatedPropertyNames[propertyKey];
      
      await ctx.db.patch(person._id, { 
        properties: updatedProperties,
        propertyNames: updatedPropertyNames
      });
    }
  },
});

// Add a repeat pattern
export const addRepeatPattern = mutation({
  args: { 
    id: v.id("people"),
    startDate: v.string(), // ISO date string (YYYY-MM-DD)
    every: v.number(),
    unit: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    unavailable: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, startDate, every, unit, unavailable, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person) return;

    console.log(`Creating new pattern starting ${startDate}, cleaning up conflicting exceptions`);

    // Clean up any exceptions that would conflict with this new pattern
    const updatedExceptions = (person.repeatExceptions || []).filter((exceptionDate: string) => {
      // Helper function to check if a date matches this new pattern
      const matchesNewPattern = (date: string): boolean => {
        const targetDate = new Date(date + 'T00:00:00');
        const patternStartDate = new Date(startDate + 'T00:00:00');
        
        if (targetDate <= patternStartDate) return false;
        
        const diffTime = targetDate.getTime() - patternStartDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (unit === 'day') {
          return diffDays % every === 0;
        } else if (unit === 'week') {
          return diffDays % (every * 7) === 0;
        } else if (unit === 'month') {
          const targetDay = targetDate.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay !== startDay) return false;
          
          const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                           (targetDate.getMonth() - patternStartDate.getMonth());
          return monthDiff % every === 0;
        }
        
        return false;
      };

      // Keep exceptions that don't conflict with the new pattern
      const shouldKeep = !matchesNewPattern(exceptionDate);
      if (!shouldKeep) {
        console.log(`Removing conflicting exception: ${exceptionDate}`);
      }
      return shouldKeep;
    });

    const updatedRepeatPatterns = {
      ...person.repeatPatterns,
      [startDate]: { every, unit, unavailable, startTime, endTime }
    };

    console.log(`Cleaned exceptions: ${(person.repeatExceptions || []).length} → ${updatedExceptions.length}`);

    await ctx.db.patch(id, { 
      repeatPatterns: updatedRepeatPatterns,
      repeatExceptions: updatedExceptions
    });
  },
});

// Remove a repeat pattern
export const removeRepeatPattern = mutation({
  args: { 
    id: v.id("people"),
    startDate: v.string() // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, { id, startDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person) return;

    const updatedRepeatPatterns = { ...person.repeatPatterns };
    delete updatedRepeatPatterns[startDate];

    await ctx.db.patch(id, { repeatPatterns: updatedRepeatPatterns });
  },
});

// Add or remove a repeat exception (toggle)
export const addRepeatException = mutation({
  args: { 
    id: v.id("people"),
    date: v.string() // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, { id, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person) return;

    const updatedExceptions = [...(person.repeatExceptions || [])];
    const existingIndex = updatedExceptions.indexOf(date);
    
    if (existingIndex >= 0) {
      // Remove from exceptions (restore to pattern)
      updatedExceptions.splice(existingIndex, 1);
      console.log(`Removed exception for ${date} - restoring to pattern`);
    } else {
      // Add to exceptions (break from pattern)
      updatedExceptions.push(date);
      console.log(`Added exception for ${date} - breaking from pattern`);
    }

    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

// Stop future repeats (add future dates to exceptions)
export const stopFutureRepeats = mutation({
  args: { 
    id: v.id("people"),
    startDate: v.string(), // ISO date string (YYYY-MM-DD) of the pattern
    monthsAhead: v.optional(v.number()), // How many months ahead to block (default 24)
    customStopFromDate: v.optional(v.string()) // Custom date to stop from (instead of tomorrow)
  },
  handler: async (ctx, { id, startDate, monthsAhead = 24, customStopFromDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person || !person.repeatPatterns || !person.repeatPatterns[startDate]) return;

    const pattern = person.repeatPatterns[startDate];
    const today = new Date().toISOString().split('T')[0];
    const stopFromDate = customStopFromDate || today;
    const stopFromDateObj = new Date(stopFromDate + 'T00:00:00');
    const updatedExceptions = [...(person.repeatExceptions || [])];
    
    // Generate future dates that match the pattern and add them to exceptions
    const patternStartDate = new Date(startDate + 'T00:00:00');
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsAhead);
    
    // Start from the chosen stop date (or tomorrow if no custom date)
    let currentDate = new Date(stopFromDateObj);
    if (!customStopFromDate) {
      currentDate.setDate(currentDate.getDate() + 1); // Tomorrow if no custom date
    }
    
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Check if this date matches the pattern using same logic as frontend
      const diffTime = currentDate.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let matches = false;
      if (diffDays > 0) { // Only future dates relative to pattern start
        if (pattern.unit === 'day') {
          matches = diffDays % pattern.every === 0;
        } else if (pattern.unit === 'week') {
          matches = diffDays % (pattern.every * 7) === 0;
        } else if (pattern.unit === 'month') {
          const targetDay = currentDate.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay === startDay) {
            const monthDiff = (currentDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                             (currentDate.getMonth() - patternStartDate.getMonth());
            matches = monthDiff % pattern.every === 0;
          }
        }
      }
      
      if (matches && !updatedExceptions.includes(dateString)) {
        updatedExceptions.push(dateString);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Added ${updatedExceptions.length - (person.repeatExceptions?.length || 0)} future exceptions for pattern starting ${startDate}`);
    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

// Clear all exceptions for a pattern (reset to original repeat behavior)
export const clearRepeatExceptions = mutation({
  args: { 
    id: v.id("people"),
    startDate: v.string() // ISO date string (YYYY-MM-DD) of the pattern
  },
  handler: async (ctx, { id, startDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const person = await ctx.db.get(id);
    if (!person || !person.repeatPatterns || !person.repeatPatterns[startDate]) return;

    const pattern = person.repeatPatterns[startDate];
    const patternStartDate = new Date(startDate + 'T00:00:00');
    
    // Remove exceptions that were created by this specific pattern
    let updatedExceptions = [...(person.repeatExceptions || [])];
    
    // Filter out exceptions that match this pattern
    updatedExceptions = updatedExceptions.filter(exceptionDate => {
      const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) return true; // Keep non-pattern exceptions
      
      let matchesPattern = false;
      if (pattern.unit === 'day') {
        matchesPattern = diffDays % pattern.every === 0;
      } else if (pattern.unit === 'week') {
        matchesPattern = diffDays % (pattern.every * 7) === 0;
      } else if (pattern.unit === 'month') {
        const targetDay = exceptionDateObj.getDate();
        const startDay = patternStartDate.getDate();
        if (targetDay === startDay) {
          const monthDiff = (exceptionDateObj.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                           (exceptionDateObj.getMonth() - patternStartDate.getMonth());
          matchesPattern = monthDiff % pattern.every === 0;
        }
      }
      
      return !matchesPattern; // Keep exceptions that don't match this pattern
    });

    console.log(`Cleared ${(person.repeatExceptions?.length || 0) - updatedExceptions.length} exceptions for pattern starting ${startDate}`);
    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

// Delete a person
export const remove = mutation({
  args: { id: v.id("people") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.delete(id);
  },
});

// ============================================================================
// MISSIONS
// ============================================================================

// Get all missions
export const listMissions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    
    return await ctx.db
      .query("missions")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();
  },
});

// Add a new mission
export const addMission = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("missions", { 
      name,
      userId: identity.subject,
      minLength: 1, // Default minimum length
      maxLength: undefined, // No maximum by default
      propertyFilters: {}, // { propertyKey: { required: boolean, value: boolean } }
      schedule: {}, // { date: { scheduled: boolean, startTime?: string, endTime?: string } }
      repeatPatterns: {}, // { startDate: { every: number, unit: 'day'|'week'|'month', scheduled: boolean, startTime?, endTime? } }
      repeatExceptions: [] // array of date strings that are exceptions to repeat patterns
    });
  },
});

// Update mission name
export const updateMissionName = mutation({
  args: { 
    id: v.id("missions"),
    name: v.string()
  },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(id, { name });
  },
});

// Update mission minimum length
export const updateMissionMinLength = mutation({
  args: { id: v.id("missions"), minLength: v.number() },
  handler: async (ctx, { id, minLength }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(id, { minLength });
  },
});

// Update mission maximum length
export const updateMissionMaxLength = mutation({
  args: { id: v.id("missions"), maxLength: v.optional(v.number()) },
  handler: async (ctx, { id, maxLength }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(id, { maxLength });
  },
});

// Update mission property filter
export const updateMissionPropertyFilter = mutation({
  args: { 
    id: v.id("missions"),
    propertyKey: v.string(),
    required: v.boolean(), // true = person must have property, false = person must NOT have property
    value: v.boolean() // Always true for boolean properties (kept for compatibility)
  },
  handler: async (ctx, { id, propertyKey, required, value }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    const updatedFilters = {
      ...mission.propertyFilters,
      [propertyKey]: { required, value: true } // Always true since we're filtering boolean properties
    };

    await ctx.db.patch(id, { propertyFilters: updatedFilters });
  },
});

// Remove mission property filter
export const removeMissionPropertyFilter = mutation({
  args: { 
    id: v.id("missions"),
    propertyKey: v.string()
  },
  handler: async (ctx, { id, propertyKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    const updatedFilters = { ...mission.propertyFilters };
    delete updatedFilters[propertyKey];

    await ctx.db.patch(id, { propertyFilters: updatedFilters });
  },
});

// Update mission schedule for a specific date
export const updateMissionSchedule = mutation({
  args: { 
    id: v.id("missions"),
    date: v.string(), // ISO date string (YYYY-MM-DD)
    scheduled: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, date, scheduled, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    const updatedSchedule = { ...mission.schedule };
    
    if (scheduled) {
      updatedSchedule[date] = { scheduled, startTime, endTime };
    } else {
      delete updatedSchedule[date];
    }

    await ctx.db.patch(id, { schedule: updatedSchedule });
  },
});

// Add mission repeat pattern
export const addMissionRepeatPattern = mutation({
  args: { 
    id: v.id("missions"),
    startDate: v.string(), // ISO date string (YYYY-MM-DD)
    every: v.number(),
    unit: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    scheduled: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, startDate, every, unit, scheduled, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    console.log(`Creating new mission pattern starting ${startDate}, cleaning up conflicting exceptions`);

    // Clean up any exceptions that would conflict with this new pattern
    const updatedExceptions = (mission.repeatExceptions || []).filter((exceptionDate: string) => {
      // Helper function to check if a date matches this new pattern
      const matchesNewPattern = (date: string): boolean => {
        const targetDate = new Date(date + 'T00:00:00');
        const patternStartDate = new Date(startDate + 'T00:00:00');
        
        if (targetDate <= patternStartDate) return false;
        
        const diffTime = targetDate.getTime() - patternStartDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (unit === 'day') {
          return diffDays % every === 0;
        } else if (unit === 'week') {
          return diffDays % (every * 7) === 0;
        } else if (unit === 'month') {
          const targetDay = targetDate.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay !== startDay) return false;
          
          const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                           (targetDate.getMonth() - patternStartDate.getMonth());
          return monthDiff % every === 0;
        }
        
        return false;
      };

      // Keep exceptions that don't conflict with the new pattern
      const shouldKeep = !matchesNewPattern(exceptionDate);
      if (!shouldKeep) {
        console.log(`Removing conflicting mission exception: ${exceptionDate}`);
      }
      return shouldKeep;
    });

    const updatedRepeatPatterns = {
      ...mission.repeatPatterns,
      [startDate]: { every, unit, scheduled, startTime, endTime }
    };

    console.log(`Cleaned mission exceptions: ${(mission.repeatExceptions || []).length} → ${updatedExceptions.length}`);

    await ctx.db.patch(id, { 
      repeatPatterns: updatedRepeatPatterns,
      repeatExceptions: updatedExceptions
    });
  },
});

// Remove mission repeat pattern
export const removeMissionRepeatPattern = mutation({
  args: { 
    id: v.id("missions"),
    startDate: v.string() // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, { id, startDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    const updatedRepeatPatterns = { ...mission.repeatPatterns };
    delete updatedRepeatPatterns[startDate];

    await ctx.db.patch(id, { repeatPatterns: updatedRepeatPatterns });
  },
});

// Add mission repeat exception (toggle)
export const addMissionRepeatException = mutation({
  args: { 
    id: v.id("missions"),
    date: v.string() // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, { id, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission) return;

    const updatedExceptions = [...(mission.repeatExceptions || [])];
    const existingIndex = updatedExceptions.indexOf(date);
    
    if (existingIndex >= 0) {
      // Remove from exceptions (restore to pattern)
      updatedExceptions.splice(existingIndex, 1);
      console.log(`Removed mission exception for ${date} - restoring to pattern`);
    } else {
      // Add to exceptions (break from pattern)
      updatedExceptions.push(date);
      console.log(`Added mission exception for ${date} - breaking from pattern`);
    }

    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

// Stop future mission repeats (add future dates to exceptions)
export const stopFutureMissionRepeats = mutation({
  args: { 
    id: v.id("missions"),
    startDate: v.string(), // ISO date string (YYYY-MM-DD) of the pattern
    monthsAhead: v.optional(v.number()), // How many months ahead to block (default 24)
    customStopFromDate: v.optional(v.string()) // Custom date to stop from (instead of tomorrow)
  },
  handler: async (ctx, { id, startDate, monthsAhead = 24, customStopFromDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const mission = await ctx.db.get(id);
    if (!mission || !mission.repeatPatterns || !mission.repeatPatterns[startDate]) return;

    const pattern = mission.repeatPatterns[startDate];
    const today = new Date().toISOString().split('T')[0];
    const stopFromDate = customStopFromDate || today;
    const stopFromDateObj = new Date(stopFromDate + 'T00:00:00');
    const updatedExceptions = [...(mission.repeatExceptions || [])];
    
    const patternStartDate = new Date(startDate + 'T00:00:00');
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsAhead);
    
    // Start from the chosen stop date (or tomorrow if no custom date)
    let currentDate = new Date(stopFromDateObj);
    if (!customStopFromDate) {
      currentDate.setDate(currentDate.getDate() + 1); // Tomorrow if no custom date
    }
    
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Check if this date matches the pattern using same logic as frontend
      const diffTime = currentDate.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let matches = false;
      if (diffDays > 0) { // Only future dates relative to pattern start
        if (pattern.unit === 'day') {
          matches = diffDays % pattern.every === 0;
        } else if (pattern.unit === 'week') {
          matches = diffDays % (pattern.every * 7) === 0;
        } else if (pattern.unit === 'month') {
          const targetDay = currentDate.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay === startDay) {
            const monthDiff = (currentDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                           (currentDate.getMonth() - patternStartDate.getMonth());
            matches = monthDiff % pattern.every === 0;
          }
        }
      }
      
      if (matches && !updatedExceptions.includes(dateString)) {
        updatedExceptions.push(dateString);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Added ${updatedExceptions.length - (mission.repeatExceptions?.length || 0)} future mission exceptions for pattern starting ${startDate}`);
    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

// Delete a mission
export const removeMission = mutation({
  args: { id: v.id("missions") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.delete(id);
  },
});

// ============= RULES MUTATIONS =============

export const listRules = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    return await ctx.db
      .query("rules")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .order("desc")
      .collect();
  },
});

export const addRule = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("rules", {
      name,
      userId: identity.subject,
      propertyFilters: {},
      schedule: {},
      repeatPatterns: {},
      repeatExceptions: []
    });
  },
});

export const updateRuleName = mutation({
  args: { id: v.id("rules"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(id, { name });
  },
});

export const updateRulePropertyFilter = mutation({
  args: { 
    id: v.id("rules"),
    propertyKey: v.string(),
    required: v.boolean(), // true = person must have property, false = person must NOT have property
    value: v.boolean() // Always true for boolean properties (kept for compatibility)
  },
  handler: async (ctx, { id, propertyKey, required, value }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    const updatedFilters = {
      ...rule.propertyFilters,
      [propertyKey]: { required, value: true } // Always true since we're filtering boolean properties
    };

    await ctx.db.patch(id, { propertyFilters: updatedFilters });
  },
});

export const removeRulePropertyFilter = mutation({
  args: { 
    id: v.id("rules"),
    propertyKey: v.string()
  },
  handler: async (ctx, { id, propertyKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    const updatedFilters = { ...rule.propertyFilters };
    delete updatedFilters[propertyKey];

    await ctx.db.patch(id, { propertyFilters: updatedFilters });
  },
});

export const updateRuleSchedule = mutation({
  args: { 
    id: v.id("rules"),
    date: v.string(), // ISO date string (YYYY-MM-DD)
    scheduled: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, date, scheduled, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    const updatedSchedule = { ...rule.schedule };
    
    if (scheduled) {
      updatedSchedule[date] = { scheduled, startTime, endTime };
    } else {
      delete updatedSchedule[date];
    }

    await ctx.db.patch(id, { schedule: updatedSchedule });
  },
});

export const addRuleRepeatPattern = mutation({
  args: { 
    id: v.id("rules"),
    startDate: v.string(), // ISO date string (YYYY-MM-DD)
    every: v.number(),
    unit: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    scheduled: v.boolean(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string())
  },
  handler: async (ctx, { id, startDate, every, unit, scheduled, startTime, endTime }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    console.log(`Creating new rule pattern starting ${startDate}, cleaning up conflicting exceptions`);

    // Clean up any exceptions that would conflict with this new pattern
    const updatedExceptions = (rule.repeatExceptions || []).filter((exceptionDate: string) => {
      // Helper function to check if a date matches this new pattern
      const matchesNewPattern = (date: string): boolean => {
        const targetDate = new Date(date + 'T00:00:00');
        const patternStartDate = new Date(startDate + 'T00:00:00');
        
        if (targetDate <= patternStartDate) return false;
        
        const diffTime = targetDate.getTime() - patternStartDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (unit === 'day') {
          return diffDays % every === 0;
        } else if (unit === 'week') {
          return diffDays % (every * 7) === 0;
        } else if (unit === 'month') {
          const targetDay = targetDate.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay !== startDay) return false;
          
          const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                         (targetDate.getMonth() - patternStartDate.getMonth());
          return monthDiff % every === 0;
        }
        
        return false;
      };

      // Keep exceptions that don't conflict with the new pattern
      const shouldKeep = !matchesNewPattern(exceptionDate);
      if (!shouldKeep) {
        console.log(`Removing conflicting rule exception: ${exceptionDate}`);
      }
      return shouldKeep;
    });

    const updatedRepeatPatterns = {
      ...rule.repeatPatterns,
      [startDate]: { every, unit, scheduled, startTime, endTime }
    };

    console.log(`Cleaned rule exceptions: ${(rule.repeatExceptions || []).length} → ${updatedExceptions.length}`);

    await ctx.db.patch(id, { 
      repeatPatterns: updatedRepeatPatterns,
      repeatExceptions: updatedExceptions
    });
  },
});

export const removeRuleRepeatPattern = mutation({
  args: { 
    id: v.id("rules"),
    startDate: v.string()
  },
  handler: async (ctx, { id, startDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    const updatedRepeatPatterns = { ...rule.repeatPatterns };
    delete updatedRepeatPatterns[startDate];

    await ctx.db.patch(id, { repeatPatterns: updatedRepeatPatterns });
  },
});

export const addRuleRepeatException = mutation({
  args: { 
    id: v.id("rules"),
    date: v.string() // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, { id, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule) return;

    const currentExceptions = rule.repeatExceptions || [];
    
    if (currentExceptions.includes(date)) {
      // Remove exception (re-enable the repeat for this date)
      const updatedExceptions = currentExceptions.filter((d: string) => d !== date);
      await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
    } else {
      // Add exception (disable the repeat for this date)
      const updatedExceptions = [...currentExceptions, date];
      await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
    }
  },
});

export const stopFutureRuleRepeats = mutation({
  args: { 
    id: v.id("rules"),
    startDate: v.string(), // The original pattern start date
    customStopFromDate: v.optional(v.string()) // Custom date to stop from (defaults to tomorrow)
  },
  handler: async (ctx, { id, startDate, customStopFromDate }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const rule = await ctx.db.get(id);
    if (!rule || !rule.repeatPatterns || !rule.repeatPatterns[startDate]) return;

    const pattern = rule.repeatPatterns[startDate];
    const stopFromDate = customStopFromDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Tomorrow
    const stopFromDateObj = new Date(stopFromDate + 'T00:00:00');
    const patternStartDate = new Date(startDate + 'T00:00:00');

    console.log(`Stopping future rule repeats from: ${stopFromDate}`);

    // Generate future dates that match the pattern and add them as exceptions
    const newExceptions: string[] = [];
    const currentExceptions = rule.repeatExceptions || [];
    
    // Look ahead 2 years maximum
    const maxDate = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    
    for (let d = new Date(stopFromDateObj); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split('T')[0];
      
      // Check if this date matches the pattern
      const diffTime = d.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let matches = false;
      if (diffDays > 0) { // Only future dates from the pattern start
        if (pattern.unit === 'day') {
          matches = diffDays % pattern.every === 0;
        } else if (pattern.unit === 'week') {
          matches = diffDays % (pattern.every * 7) === 0;
        } else if (pattern.unit === 'month') {
          const targetDay = d.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay === startDay) {
            const monthDiff = (d.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                             (d.getMonth() - patternStartDate.getMonth());
            matches = monthDiff % pattern.every === 0;
          }
        }
      }
      
      if (matches && !currentExceptions.includes(dateString)) {
        newExceptions.push(dateString);
      }
    }

    console.log(`Adding ${newExceptions.length} rule exceptions to stop future repeats`);

    const updatedExceptions = [...currentExceptions, ...newExceptions];
    await ctx.db.patch(id, { repeatExceptions: updatedExceptions });
  },
});

export const removeRule = mutation({
  args: { id: v.id("rules") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.delete(id);
  },
}); 