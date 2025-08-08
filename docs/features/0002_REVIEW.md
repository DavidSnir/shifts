Feature Review: Calendar infinite day scroller

Summary
- The calendar renders a vertically stacked list of days with a time gutter and mission columns. Infinite scrolling extends days in both directions. Zoom is supported via ctrl+wheel and pinch gestures.

Findings
- Sticky date base coupling: `useStickyDate` originally used the parent-provided `selectedDate` as the scroll base, causing rebasing while scrolling and feedback loops into `onDateChange`.
- Aggressive day regeneration: `CalendarDayScroller` rebuilt the `days` buffer on every `selectedDate` change, which often came from the sticky callback, amplifying updates.
- Rapid infinite extension: The scroll handler appended/prepended without any cooldown, potentially firing multiple times during a single scroll and adding too many days quickly.
- Jump to today behavior: Resetting the buffer centered around today would snap the list abruptly and could trigger additional onScroll cascades.

Edits
- `src/calendar/useStickyDate.ts`
  - Changed API to accept a stable `baseISO` (first loaded day) instead of the anchor date from parent.
  - This prevents re-basing while the user scrolls and stops feedback loops.

- `src/calendar/CalendarDayScroller.tsx`
  - Pass `(days[0] ?? selectedDate)` as the sticky base.
  - Synchronize sticky date to parent via an effect with a `lastSentStickyRef` guard to avoid redundant updates.
  - Rebuild days only when `selectedDate` lies outside the loaded range; otherwise scroll to it within the existing buffer.
  - After rebuilding, center scroll to the middle day to align with the selected date.
  - Added a lightweight cooldown (~120ms) in the scroll handler to prevent rapid repeated buffer extensions.

Potential follow-ups
- Consider clamping the maximum number of days rendered to avoid unbounded DOM growth (e.g., recycle older days when far from center).
- Virtualize day containers if mission columns become heavy.
- Persist zoom level across sessions if desired.

Conclusion
- The infinite scrolling now extends in a controlled manner, sticky date is calculated from a stable base, and parent `selectedDate` stays in sync without causing list rebuild thrash.


