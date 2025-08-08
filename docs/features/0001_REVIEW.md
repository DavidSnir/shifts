Title: Review of unified date selection feature

Summary
- App now has a unified date selection component under `src/components/UnifiedDateSelection/` and shared helpers in `src/utils/dateScheduling.ts`.
- `src/App.tsx` imports and uses `UnifiedDateGrid` for People, Missions, and Rules, but still contains old inline implementations and helper functions that should be removed. This is causing import conflicts and keeps the file large.

What was implemented (matches plan)
- New components:
  - `src/components/UnifiedDateSelection/UnifiedDateGrid.tsx`
  - `src/components/UnifiedDateSelection/UnifiedDateCell.tsx`
  - `src/components/UnifiedDateSelection/RepeatPopup.tsx`
  - `src/components/UnifiedDateSelection/RemoveRepeatPopup.tsx`
  - `src/components/UnifiedDateSelection/TimeInput24.tsx`
  - `src/components/UnifiedDateSelection/index.ts`
- Shared helpers in `src/utils/dateScheduling.ts`:
  - `getThreeWeeks`, `getWeekNumber`, `getTodayString`, `isToday`, `getDayOfMonth`
  - `matchesRepeatPattern`, `matchesMissionRepeatPattern`, `matchesRuleRepeatPattern`
  - `getEffectiveAvailability`, `getEffectiveMissionSchedule`, `getEffectiveRuleSchedule`
- `src/App.tsx` imports `UnifiedDateGrid` and date helpers from utils.

Where the app uses the unified component
- People (person page):
  - Uses `UnifiedDateGrid` with `type="person"`.
- Missions (mission page):
  - Uses `UnifiedDateGrid` with `type="mission"`.
- Rules (rule page):
  - Uses `UnifiedDateGrid` with `type="rule"`.

Issues found
- Old implementations still defined in `src/App.tsx`:
  - Inline functions for mission/rule repeat matching and effective schedule still exist (e.g. `matchesMissionRepeatPattern`, `getEffectiveMissionSchedule`, `matchesRuleRepeatPattern`, `getEffectiveRuleSchedule`). These duplicate the imported helpers and cause linter errors about conflicting declarations.
  - Legacy inline components also remain: `UnifiedCalendarGrid`, `UnifiedCalendarCell`, `RepeatPopup`, `RemoveRepeatPopup`, and `TimeInput24`. They are marked as “moved” in comments but are still present in the file. They should be deleted now that the extracted versions exist.
- Import conflict errors:
  - Example linter errors: conflicts for `matchesMissionRepeatPattern`, `matchesRuleRepeatPattern`, `getEffectiveAvailability`, `getEffectiveMissionSchedule`, `getEffectiveRuleSchedule` due to duplicates in `src/App.tsx`.
- File size/structure:
  - `src/App.tsx` remains very large and hard to maintain. Removing the old implementations will reduce size and improve clarity.
- Potential stray import:
  - `import { CalendarDayScroller } from './calendar/CalendarDayScroller'` appears but no such file exists in the workspace snapshot. Verify or remove.

Concise fix recommendations
- In `src/App.tsx`:
  - Remove the local definitions of: `matchesMissionRepeatPattern`, `matchesRuleRepeatPattern`, `getEffectiveAvailability`, `getEffectiveMissionSchedule`, `getEffectiveRuleSchedule` (and any other helper duplicates).
  - Remove the local component implementations: `UnifiedCalendarGrid`, `UnifiedCalendarCell`, `RepeatPopup`, `RemoveRepeatPopup`, `TimeInput24` (now in `src/components/UnifiedDateSelection/`).
  - Keep only the imports from `src/utils/dateScheduling` and `src/components/UnifiedDateSelection`.
  - If not used, delete the `CalendarDayScroller` import or add the file.

Optional improvements
- Extract `Person`, `Mission`, `Rule` interfaces into `src/types/domain.ts` and import where needed.
- Consider memoization of effective schedule calculations if performance becomes a concern.


