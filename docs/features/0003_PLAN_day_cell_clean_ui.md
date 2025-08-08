### Day cell clean UI: click-to-toggle + inline Edit panel

Brief: Redesign the day selector cell to a cleaner interaction. The cell itself toggles state on click (no checkbox). When active, an inline Edit control appears that opens a single consolidated popup for full-day/time and repeat settings. Repeat indicators still render on the cell.

Key behavior from request:
- Clicking a day cell toggles it on: background turns black, text becomes white; no separate checkbox control.
- After clicking, an Edit button appears; opening it shows one popup that contains:
  - Full-day switch
  - Start/End time inputs (only if not full-day)
  - Repeat switch + repeat settings (migrate existing repeat popup fields)
- Still show if a cell is repeated (keep badge/indicator). Goal: cleaner look.

Affected files and changes
- `src/components/UnifiedDateSelection/UnifiedDateCell.tsx`
  - Remove checkbox visuals; make entire cell header area the toggle target
  - Apply black background + white text styles when active
  - Add an inline small "EDIT" button visible when active (bottom or top-right within content area)
  - Remove direct REPEAT button; its functionality moves under the Edit popup
  - Keep and position repeat indicators (R, O) next to the date number
  - New state: `isEditOpen`
  - Add the month near the date - dd/mm
  - Handlers:
    - `handleCellToggle()`: toggles active; if turning off and item is repeated with origin, delegate removal logic (see below)
    - `openEdit()`, `closeEdit()`
    - `applyEdits({ fullDay, startTime, endTime, repeatEnabled, repeatEvery, repeatUnit })`
  - Visual: reduce inactive cell min-height; active cell keeps current height

- `src/components/UnifiedDateSelection/UnifiedDateGrid.tsx`
  - Remove usage of `RepeatPopup` and `RemoveRepeatPopup` (and their local state)
  - Pass through the same callbacks: `onUpdateAvailability`, `onUpdateSchedule`, `onAddRepeatPattern`, `onRemoveRepeatPattern`, `onAddRepeatException`, `onStopFutureRepeats`
  - The edit popup will be triggered from inside `UnifiedDateCell`

- `src/components/UnifiedDateSelection/RepeatPopup.tsx` and `RemoveRepeatPopup.tsx`
  - Migrate their functionality into a single new inline popup component (local to `UnifiedDateCell`), then delete these files

- `src/components/UnifiedDateSelection/TimeInput24.tsx`
  - Reuse for time inputs inside the Edit popup

- `src/utils/dateScheduling.ts`
  - No logic changes required; continue to use: `getEffectiveAvailability`, `getEffectiveMissionSchedule`, `getEffectiveRuleSchedule`, pattern matchers, etc.

- Tabs using the grid (`src/peopleTab.tsx`, `src/missionsTab.tsx`, `src/rulesTab.tsx`)
  - No additional UI above the calendar; keep as-is after recent cleanup

UI flow / interaction logic
1) Toggle on/off by clicking cell header (date row):
   - If currently inactive → activate
     - Set full-day default (all-day true, times empty) and call:
       - People: `onUpdateAvailability(id, date, true, '', '')`
       - Mission/Rule: `onUpdateSchedule({ id, date, scheduled: true, startTime: '', endTime: '' })`
   - If currently active → deactivate
     - If the effective entry is a repeated occurrence and has an origin:
       - Show inline confirmation inside the Edit popup area or mini-overlay:
         - "Remove only this date" → `onAddRepeatException({ id, date })`
         - "Remove this date and all following" → If `date === patternStart`, call `onRemoveRepeatPattern`, else `onStopFutureRepeats({ id, startDate, customStopFromDate: date })`
     - Else (non-repeated) call the appropriate update to set inactive

2) Edit button (only visible when active): opens an inline modal/popup positioned over the cell
   - Controls:
     - Full-day switch: toggles between all-day and time range
     - Start/End times (use `TimeInput24`) when not full-day
     - Repeat switch: enables/disables repeating; when enabled, show:
       - `every` (number), `unit` ('day'|'week'|'month')
   - Apply:
     - If repeat switch is enabled, call `onAddRepeatPattern({ id, startDate: date, every, unit, scheduled/unavailable, startTime, endTime })`
     - Apply availability/schedule for this date using the same values
   - Cancel: close without persisting additional changes (beyond whatever was applied by initial toggle)

Data and state
- `effectiveData` already provides: `scheduled/unavailable`, `startTime`, `endTime`, `isRepeated`, `isRepeatOrigin`, `originalStartDate`
- Local state inside cell:
  - `isEditOpen: boolean`
  - `isFullDay: boolean`
  - `localStartTime: string`, `localEndTime: string`
  - `repeatEnabled: boolean`, `repeatEvery: number`, `repeatUnit: 'day'|'week'|'month'`

Algorithms (per action)
- Toggle active on:
  1. Set `isFullDay=true`, `localStartTime=''`, `localEndTime=''`
  2. Persist via appropriate update fn

- Toggle active off:
  1. If `effectiveData.isRepeated && effectiveData.originalStartDate` → show confirmation with 2 paths
  2. Else call update to set inactive immediately

- Toggle full-day switch:
  1. When turning on: set times to '' and persist
  2. When turning off: set defaults ('09:00' → '17:00') and persist

- Apply in Edit popup:
  1. If `repeatEnabled`, call `onAddRepeatPattern` with current time values and appropriate scheduled/unavailable
  2. Always call update for this date with the same values
  3. Close edit

Deletions and migrations
- Remove `RepeatPopup.tsx` and `RemoveRepeatPopup.tsx`
- Remove related state from `UnifiedDateGrid`
- Consolidate repeat UI into the new Edit popup inside `UnifiedDateCell`

Implementation steps
1. Build Edit popup UI inside `UnifiedDateCell` (modal or absolute overlay within cell)
2. Wire toggle on cell header; remove checkbox visual
3. Move REPEAT logic into Edit popup; delete old popups and their references
4. Keep R/O badges next to the date number; ensure visibility on both active/inactive
5. QA edge cases (repeated entries, time validation, full-day toggling)

Notes
- Keep styles consistent with current minimalist look (1px borders, square corners)
- Maintain accessibility: ensure keyboard activation and focus handling within popup

