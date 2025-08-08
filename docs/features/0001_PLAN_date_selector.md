Title: Unify date selection for People, Missions, and Rules into a single component in a separate file

Context
- The goal is the "unition of the people, mission, and rules date selection to a one unified component in a seperate file" (verbatim).
- Today, date selection and per-day editing logic live inside `src/App.tsx` as multiple inline components:
  - `UnifiedCalendarGrid`, `UnifiedCalendarCell` (already partially unifying)
  - `RuleCalendarGrid`, `RuleCalendarCell` (rule-specific)
  - `RepeatPopup`, `RemoveRepeatPopup`, `TimeInput24`
  - Helper functions for effective schedule/availability and repeat logic:
    - People: `getEffectiveAvailability` + repeat helpers
    - Missions: `getEffectiveMissionSchedule` + repeat helpers
    - Rules: `getEffectiveRuleSchedule` + repeat helpers
- Tabs using date selection today: `PeopleTab` (via `PersonPage`), `MissionTab`, `RulesTab`.

Plan Overview
- Extract a single reusable date selection module to a new folder and file(s), then have People/Mission/Rules consume it via a consistent API.
- Keep backend API shapes unchanged (Convex mutations/queries remain the same).

Target File Structure (new)
- `src/components/UnifiedDateSelection/`
  - `UnifiedDateGrid.tsx` (extracted from existing `UnifiedCalendarGrid`)
  - `UnifiedDateCell.tsx` (extracted from existing `UnifiedCalendarCell`)
  - `RepeatPopup.tsx` (extracted from existing `RepeatPopup`)
  - `RemoveRepeatPopup.tsx` (extracted from existing `RemoveRepeatPopup`)
  - `TimeInput24.tsx` (extracted from existing `TimeInput24`)
  - `index.ts` (barrel exports)
- `src/utils/dateScheduling.ts`
  - Move shared helpers: `getThreeWeeks`, `getWeekNumber`, `getTodayString`, `isToday`, `getDayOfMonth`
  - Move repeat calculators: `matchesRepeatPattern` (people), `matchesMissionRepeatPattern`, `matchesRuleRepeatPattern`
  - Move effective-state resolvers: `getEffectiveAvailability`, `getEffectiveMissionSchedule`, `getEffectiveRuleSchedule`
- (Optional) `src/types/domain.ts`
  - Extract `Person`, `Mission`, `Rule`, and the common per-day schedule/availability shapes

Public API (new unified component)
- Component: `UnifiedDateGrid`
  - Props:
    - `title: string`
    - `kind: 'person' | 'mission' | 'rule'`
    - `data: Person | Mission | Rule` (exact union type)
    - `onUpdateAvailability?: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>`
    - `onUpdateSchedule?: (params: { id: string; date: string; scheduled: boolean; startTime?: string; endTime?: string }) => Promise<void>`
    - Repeat operations (all optional; consumer passes only those relevant for the `kind`):
      - People: `onAddRepeatPattern`, `onRemoveRepeatPattern`, `onAddRepeatException`, `onStopFutureRepeats`
      - Missions: `onAddMissionRepeatPattern`, `onRemoveMissionRepeatPattern`, `onAddMissionRepeatException`, `onStopFutureMissionRepeats`
      - Rules: `onAddRuleRepeatPattern`, `onRemoveRuleRepeatPattern`, `onAddRuleRepeatException`, `onStopFutureRuleRepeats`
  - Behavior: Renders 3-week calendar with week navigation and per-day cells; internally shows repeat/remove-repeat popups and time inputs; delegates persistence to callbacks.
- Internal: `UnifiedDateCell` (no direct external use)
  - Receives `kind`, `date`, and the effective state for that date. Emits updates via the appropriate callback depending on `kind`.

Algorithms & Logic (step-by-step)
1) Generating the 3-week view
   - Use `getThreeWeeks(weekOffset)` to produce an array of 3 consecutive weeks (each as 7 ISO `YYYY-MM-DD` dates) and corresponding week numbers.
   - Provide `weekOffset` state to navigate backward/forward.

2) Computing the per-day state (effective schedule/availability)
   - People: `getEffectiveAvailability(person, date)` returns either undefined (no unavailability) or an object with flags:
     - Priorities:
       1. If the date is a repeat origin and has direct availability, treat as reset origin (non-repeated).
       2. If the date has direct availability but is not a repeat origin, mark as direct and possibly `wasBrokenFromPattern` if it matches a pattern.
       3. If the date is in exceptions and has no direct availability, return undefined (canceled repeat instance).
       4. Else, check repeat patterns; return repeated instance or origin with appropriate flags.
   - Missions/Rules: `getEffectiveMissionSchedule` / `getEffectiveRuleSchedule` with analogous priorities for `scheduled` state.

3) Toggling a day
   - People (`kind='person'`): toggle between available (no record) and unavailable. When unavailable:
     - If "All Day" is checked, set `startTime=''` and `endTime=''`.
     - Otherwise, use local `TimeInput24` values.
     - Call `onUpdateAvailability(personId, date, unavailable, startTime, endTime)`.
   - Missions/Rules (`kind='mission' | 'rule'`): toggle `scheduled` true/false, analogous to above; call `onUpdateSchedule({ id, date, scheduled, startTime, endTime })`.

4) Editing times
   - When not full-day, `TimeInput24` validates and provides `HH:mm` values. On blur/update, persist via the same update callbacks as above.

5) Repeat creation
   - Opening `RepeatPopup` from a scheduled/unavailable day allows:
     - Choose repeat every N units (day|week|month) and optional times.
     - If enabled, call the corresponding add-repeat-pattern mutation (people/missions/rules).
     - Always also upsert the base-day schedule/unavailability via its update callback.

6) Removing repeat effects
   - If attempting to uncheck a repeated instance, open `RemoveRepeatPopup` with two choices:
     - Remove only this date: call add-exception (toggle) for that date.
     - Remove all following: call the stop-future-repeats mutation with the origin and the chosen stop-from date.

Edits Required
- `src/App.tsx`:
  - Remove inline component definitions for: `UnifiedCalendarGrid`, `UnifiedCalendarCell`, `RuleCalendarGrid`, `RuleCalendarCell`, `RepeatPopup`, `RemoveRepeatPopup`, and `TimeInput24`.
  - Import from `src/components/UnifiedDateSelection` instead.
  - Update `PeopleTab`/`PersonPage`, `MissionTab`, and `RulesTab` to use the extracted `UnifiedDateGrid` component with the new `kind` prop and the existing Convex callbacks.
  - Delete usages of rule-specific grid/cell if fully superseded by unified grid/cell.
- `src/utils/dateScheduling.ts`:
  - Move helper functions from `src/App.tsx` to this utils module and update imports.
- (Optional) `src/types/domain.ts`:
  - Move `Person`, `Mission`, `Rule` interfaces from `src/App.tsx` to here. Update all imports accordingly.

Backend Notes (no changes required)
- Keep Convex mutation/query shapes unchanged in `convex/people.ts`:
  - People: `updateAvailability`, repeat pattern/exception mutations.
  - Missions: `updateMissionSchedule`, mission repeat mutations.
  - Rules: `updateRuleSchedule`, rule repeat mutations.

Phased Implementation
- Phase 1: Utilities & Types
  - Create `src/utils/dateScheduling.ts` and move date helpers and effective schedule logic.
  - (Optional) Create `src/types/domain.ts` and move `Person`/`Mission`/`Rule` types.

- Phase 2: Extract UI components
  - Create `src/components/UnifiedDateSelection` and extract `TimeInput24`, `RepeatPopup`, `RemoveRepeatPopup`, `UnifiedDateCell`, `UnifiedDateGrid` from `src/App.tsx` with zero behavior changes.
  - Ensure `UnifiedDateGrid` accepts `kind` and delegates to the correct callbacks.

- Phase 3: Integrate into tabs
  - Replace inline components in `PeopleTab`/`PersonPage`, `MissionTab`, `RulesTab` with the imported `UnifiedDateGrid`.
  - Remove `RuleCalendarGrid` and `RuleCalendarCell` usages if redundant; prefer the unified grid.

- Phase 4: Cleanup
  - Delete leftover component definitions from `src/App.tsx`.
  - Update imports and fix any type errors.

Edge Cases & Considerations
- Time semantics: People use `unavailable` while Missions/Rules use `scheduled`. The unified cell must map semantics based on `kind`.
- Full-day encoding uses empty strings for `startTime`/`endTime`. Preserve this convention for consistency with existing data.
- Repeat origins that were manually reset vs. repeated instances have distinct flags; ensure flags are preserved when moving logic to utils.
- Exceptions vs. direct overrides: direct entries must override exceptions when both exist.
- Performance: Avoid re-computing effective schedules unnecessarily; memoize if needed by date and entity ID.

Testing
- Manual walkthrough:
  - For each `kind`, toggle days, set full-day vs. time ranges, create repeat patterns, add/remove exceptions, stop future repeats.
  - Verify UI flags (repeat origin, repeated instance, reset origin) render as before.
  - Verify Convex calls fire with identical payloads as before (inspect network/logs).

Out of Scope
- Calendar week navigation improvements or virtualized list performance optimizations.
- Changes to Convex schema or server functions.


