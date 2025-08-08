Feature Review: Calendar scroll jumps two days when scrolling up (mouse)

Scope
- Component(s): `src/calendar/CalendarDayScroller.tsx`, `src/calendar/useStickyDate.ts`, `src/calendar/DayGrid.tsx`
- Behavior: Scrolling upward advances two days instead of one; mouse input (non-ctrl) on Windows.

Findings
- Sticky date mapping offset: The sticky-date hook is called with a non-zero `offsetTopPx` (titles/header height), but the sticky titles row is rendered ABOVE the scroll container, not inside it. Adding this offset shifts the computed day index and can cause a two-day jump when crossing boundaries upward.
  - Code: `useStickyDate(containerRef, baseISO, dayHeightPx, TITLES_ROW_PX)` in `CalendarDayScroller.tsx`.
  - The scrollable area contains only day panels of height `dayHeight`; no per-day header inside the scrollable content.

- Day size consistency: After recent changes, `dayHeight = slotsPerDay * rowHeightPx`, and the virtualization spacers use `visibleRange.start * dayHeight`. This part is consistent.

- Sticky update timing: `stickyISO` is derived purely from `scrollTop / dayHeight` (via the hook). When a wheel tick lands near the boundary, the extra offset can push the division result over the next integer threshold, effectively counting an extra day.

- Programmatic scroll suppression: We correctly suppress parent sync during programmatic scrolls. This does not cause the two-day jump, but it can mask symptoms during rebuilds.

Primary root cause
- Mismatch between sticky-date index mapping and actual scrolled content due to using a non-zero offset while the header is outside of the scrolling container. This can produce an off-by-one on both sides of a boundary; combined with floor/thresholds and wheel deltas, it manifests as two-day jumps when scrolling upward.

Recommendations (fix order)
1) Remove the sticky-date offset
   - Change `const stickyISO = useStickyDate(containerRef, (days[0] ?? selectedDate), dayHeight, TITLES_ROW_PX);`
     to `const stickyISO = useStickyDate(containerRef, (days[0] ?? selectedDate), dayHeight, 0);`
   - Rationale: The sticky header is not part of the scrollable content, so `offsetTopPx` must be 0.

2) Optional: Snap-to-day for mouse wheel
   - In `onWheel` for the scroll container (only when not `ctrlKey`), prevent default and set `scrollTop` to the nearest day boundary: `Math.round((scrollTop ± k) / dayHeight) * dayHeight`.
   - Pros: Guarantees exactly one day per wheel notch regardless of device settings; greatly improves predictability.
   - Cons: Slightly less “smooth” scrolling for trackpads; consider enabling only for mouse (non-precision scroll) or behind a preference.

3) Guard sticky recompute to nearest boundary
   - Instead of `Math.floor(adjusted / dayHeightPx)`, compute `Math.round(scrollTop / dayHeight)` to favor the nearest visible day when wheel deltas land between boundaries.
   - Only do this if (1) alone does not fix the issue.

Validation checklist
- With (1) applied, one wheel notch up/down moves exactly one day.
- Virtualization still renders only the visible days; no gaps.
- Infinite prepend/append still keeps scroll position stable and does not drift to past.
- “Jump to today” still centers on the selected day without triggering extra day changes.

Potential follow-ups
- Add a feature flag for wheel snap to day boundaries for mouse users.
- Unit-test utility: a pure function mapping `(scrollTop, dayHeight, baseISO)` → `iso`, tested across boundary values and offsets.


