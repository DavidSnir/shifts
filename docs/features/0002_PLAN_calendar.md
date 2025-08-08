### Feature: Calendar tab with infinite vertical day scroller, mission columns, hour rows, pinch-to-zoom, and sticky date

Brief

- Build the Calendar tab UI from scratch to satisfy: "infinte calndar with vertical seamlse scroll between days, the colums are the missions and the rows are the hours, that you can pinch to zoom in\ out like in apple calendar for example. sticky date on top that updates when you scolled to the next day".
- Columns = Missions. Rows = time-of-day slots (hours; sub-steps with zoom).
- Infinite vertical scroll across days (no visible seams). Sticky date header updates as the visible day changes. Touch pinch-to-zoom and desktop Ctrl+wheel zoom maintain scroll anchor.

Relevant files and functions

- Frontend
  - `src/App.tsx`
    - Replace the current placeholder `CalendarTab`/`InfiniteScrollCalendarView` implementation with a composed Calendar module.
    - Continues to source `missions` via `useQuery(api.people.listMissions)` already used in `MissionTab()`.
  - New files under `src/calendar/`
    - `src/calendar/CalendarDayScroller.tsx`: Top-level component for the Calendar tab. Orchestrates data fetch, virtualization, zoom state, and sticky header.
    - `src/calendar/DayVirtualList.tsx`: Virtualized vertical list of days that supports prepending/appending days as you scroll.
    - `src/calendar/DayGrid.tsx`: Renders one day grid with columns = missions, rows = time slots at current zoom; supports horizontal overflow for many missions.
    - `src/calendar/TimeScale.tsx`: Left time gutter rendering (hour labels), synced with zoom.
    - `src/calendar/usePinchZoom.ts`: Hook handling touch pinch and Ctrl+wheel zoom with anchor-preserving scroll math.
    - `src/calendar/useStickyDate.ts`: Hook that computes the currently visible date for the sticky header using scrollTop and day height.
    - `src/calendar/schedule.ts`: Utilities to compute effective mission schedule for a date (base schedule + repeatPatterns − repeatExceptions), consistent with People/Rules.
    - `src/calendar/types.ts`: Calendar-specific types (e.g., `ZoomState`, `TimeSlot`, `DayKey`, `ColumnLayout`).
- Backend (Convex)
  - No schema change required. Use existing `missions` model in `convex/schema.ts` and mission queries/mutations in `convex/people.ts`:
    - Query: `listMissions`
    - Mutations leveraged (future interactions): `updateMissionSchedule`, `addMissionRepeatPattern`, `removeMissionRepeatPattern`, `addMissionRepeatException`, `stopFutureMissionRepeats`.

Data and types

- Mission (frontend shape) from `src/App.tsx`:
  - `schedule: Record<string, { scheduled: boolean; startTime?: string; endTime?: string }>`
  - `repeatPatterns?: Record<string, { every: number; unit: 'day' | 'week' | 'month'; scheduled: boolean; startTime?: string; endTime?: string }>`
  - `repeatExceptions?: string[]`
- Calendar derives per-day mission windows by evaluating schedule + pattern − exceptions for each mission.

Algorithms and behaviors

1) Infinite vertical seamless scrolling between days
- Model days as integer offsets around an anchor date (e.g., `selectedDate` ISO `YYYY-MM-DD`). Maintain an ordered list of day keys: [D−N, …, D0, …, D+N].
- Virtualization model:
  - `zoom.rowHeightPx` determines `SLOTS_PER_DAY` (default 48 half-hour slots) and `dayHeightPx = SLOTS_PER_DAY * rowHeightPx`.
  - The scroll container height is the sum of rendered days; as the user approaches top/bottom thresholds (e.g., within 2× `dayHeightPx`), prepend/append more day keys.
  - Option A (simple): Use a growing list and maintain `scrollTop` offset when prepending.
  - Option B (optimized): Fixed spacer elements above/below plus a small window of mounted day components.
- Seamlessness: No visible day header separators in the scroll surface; any date label is moved to the sticky header area.

2) Sticky date header that updates when scrolled to the next day
- Compute the index of the top-most fully or mostly visible day: `visibleDayIndex = Math.floor(scrollTop / dayHeightPx)`.
- Convert `visibleDayIndex` to a date string via anchor date + offset.
- Update sticky header state with this date.
- Edge handling when `rowHeightPx` changes: recompute `dayHeightPx`, preserve `scrollTop` anchor (see zoom section).

3) Columns are missions; rows are hours
- Columns = all missions for the current user from `listMissions`.
  - If mission count exceeds viewport width, allow horizontal scrolling on the day grid; freeze the left `TimeScale` gutter.
- Rows = time-of-day grid derived from `SLOTS_PER_DAY` at current zoom. Draw heavier grid lines on exact hours and lighter lines on sub-slots.
- Each `DayGrid` receives: `date`, `missions[]`, `zoom`, and `effectiveScheduleByMissionId` for that `date`.

4) Effective schedule computation (mission windows per date)
- Implement in `src/calendar/schedule.ts`:
  - Input: `mission`, `date (YYYY-MM-DD)`.
  - Steps:
    1. If `mission.schedule[date]` exists: use it.
    2. Else, scan `mission.repeatPatterns`:
       - For each `startDate` pattern, compute if `date` matches:
         - `day`: `(date - startDate) in days % every === 0` and `date >= startDate`.
         - `week`: `diffDays % (every * 7) === 0` and `date >= startDate`.
         - `month`: same day-of-month and `monthDiff % every === 0` and `date >= startDate`.
       - If matches and `repeatExceptions` does NOT include `date`, treat as scheduled with pattern’s `startTime`/`endTime`.
    3. Otherwise, not scheduled for that date.
  - Output: `{ scheduled: boolean, startTime?: string, endTime?: string } | undefined`.

5) Pinch-to-zoom like Apple Calendar (touch pinch and Ctrl+wheel)
- Zoom state: `rowHeightPx` in a clamped range (e.g., 12–80 px), with derived `SLOTS_PER_DAY` fixed at 48 (half-hours). Increase `rowHeightPx` for zoom-in.
- Anchor-preserving zoom:
  - Compute `pivotY` in container coordinates (center of pinch or mouse pointer).
  - Compute `timeAtPivotBefore = (scrollTop + pivotY) / dayHeightPx * 24h`.
  - Apply new `rowHeightPx`, recompute `dayHeightPx`.
  - Compute `scrollTop'` so that `timeAtPivotBefore` maps back to the same `pivotY`:
    - `timeFraction = timeAtPivotBefore / 24h`.
    - `targetOffsetWithinDay = timeFraction * dayHeightPx'`.
    - `dayIndex = floor((scrollTop + pivotY) / oldDayHeightPx)` (stable near pivot day).
    - `scrollTop' = dayIndex * dayHeightPx' + targetOffsetWithinDay - pivotY`.
- Gesture handling:
  - Touch: track two touches to get distance delta; map to zoom delta with damping; debounce to avoid jitter.
  - Desktop: handle `wheel` with `ctrlKey` true; prevent default scrolling to avoid accidental zoom.

6) Rendering layout
- Sticky header at top of `CalendarDayScroller`: shows formatted date of `visibleDayIndex`, plus a Today button and zoom controls (+/−) for accessibility.
- Scroll body: a single vertical scroll container (`overflow-y: auto`) of days with no inter-day gaps.
- For each day:
  - Grid layout with a sticky left `TimeScale` column (hour labels) and a scrollable columns container for missions.
  - Each mission column renders scheduled blocks for that date at the correct vertical span based on `startTime`/`endTime`. If only `scheduled: true` with no times, render a full-day block.
  - If unscheduled, show empty grid background.
- Optional now-indicator line when `visibleDayIndex` corresponds to today.

7) Performance and virtualization details
- Only mount a small window of days (e.g., ±7 from the sticky date’s day) to keep DOM light; expand/contract as the user scrolls.
- When prepending days, adjust `scrollTop` by `numPrepended * dayHeightPx` to avoid visual jump.
- Memoize `effectiveScheduleByDateByMissionId` using a cache keyed by `mission._id + date + repeatPatterns version + exceptions version`.
- Avoid reflow storms by batching zoom-induced recalculations with `requestAnimationFrame`.

UI/UX details

- Sticky date format: Today/Tomorrow/Yesterday where applicable, else `Weekday, Month Day, Year`.
- Horizontal overflow for many missions with a subtle bottom scrollbar; ensure `TimeScale` remains pinned.
- Keyboard: `Ctrl/Cmd +` and `Ctrl/Cmd −` trigger zoom in/out.
- Accessibility: maintain focus ring and ensure scroll container is reachable; label the sticky date for screen readers.

Integration points and edits

- `src/App.tsx`
  - Replace the current `InfiniteScrollCalendarView` usage in `CalendarTab()` with `CalendarDayScroller` from `src/calendar/CalendarDayScroller.tsx`.
  - Pass `missions` from `useQuery(api.people.listMissions)` into `CalendarDayScroller`.
  - Keep `selectedDate` state and `jumpToToday()` in `CalendarTab`; wire `onDateChange` to `CalendarDayScroller` so sticky date updates the parent state.
- `src/calendar/schedule.ts`
  - Implement `getEffectiveMissionSchedule(mission, date)` as described above, mirroring People/Rules pattern logic already present in `src/App.tsx`.

Open questions (to confirm if needed)

- Should the left time gutter be visible for each day or a single pinned gutter across the whole scroller? Plan assumes a per-day pinned gutter within each day row to simplify layout and anchoring.
- For missions without times (all-day), should we show a thin top banner or a full-height column fill? Plan assumes full-day block for clarity.
- Should we support drag-to-create/edit in this first pass? Out of scope per request; can be added after the scroller is stable.

Rollout plan (phased)

- Phase 1: Data and utilities
  - Create `src/calendar/types.ts` and `src/calendar/schedule.ts`.
  - Verify `listMissions` path and types; no Convex changes.
- Phase 2: Core scroller
  - Implement `useStickyDate`, `usePinchZoom`, and `DayVirtualList`.
  - Render days with `TimeScale` and an empty `DayGrid` to validate scroll/zoom math and sticky header.
- Phase 3: Mission columns and schedule blocks
  - Implement `DayGrid` with mission columns and scheduled block drawing.
  - Add horizontal overflow handling.
- Phase 4: Polish and perf
  - Add now-indicator, accessibility, keyboard zoom, memoization, and window-size virtualization.

Success criteria (technical)

- Seamless infinite vertical scroll across days with no visual jumps when loading more days.
- Sticky date header reflects the top-most visible day and updates smoothly during scroll.
- Pinch (touch) and Ctrl+wheel (desktop) zoom change row height and preserve anchor under the pointer/pinch center.
- Columns render all missions; rows render hour lines; scheduled windows render at correct vertical spans per date.


