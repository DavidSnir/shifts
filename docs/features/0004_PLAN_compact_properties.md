Title: Compact, collapsible properties on Missions, People, and Rules pages

Context
- User request (verbatim): "make the properties more compact in the missionsTab.tsx peopleTab.tsx rulesTab.tsx pages, smaller remove button and colapsable"
- Scope is UI-only. No backend or data model changes required.

Goals
- Make property rows/filters visually compact across all three pages.
- Replace full-width property rows where appropriate with tighter layout (reduced padding, smaller toggle, smaller remove button).
- Wrap the property sections in a collapsible container with a concise header that shows a count badge.

Files to update
- src/peopleTab.tsx
  - Component: `PeopleTab` list is unchanged; `PersonPage` "PROPERTIES" section must become collapsible and compact.
- src/missionsTab.tsx
  - Component: default export; "PROPERTY FILTERS" section must become collapsible and compact.
- src/rulesTab.tsx
  - Components: `RulePage` and default export; "PROPERTY FILTERS" section must become collapsible and compact.

New components
- src/components/CollapsibleSection.tsx
  - Simple self-contained collapsible wrapper with inline styles (to match current project style), no external CSS.
  - Props:
    - `title: string` — Section title text (e.g., "PROPERTIES", "PROPERTY FILTERS").
    - `count?: number` — Optional badge showing number of items in the section (e.g., number of filters).
    - `defaultOpen?: boolean` — Optional initial open state (default true).
    - `children: React.ReactNode` — The content to render when open.
  - Behavior:
    - Clicking the header toggles open/closed.
    - Header shows a caret icon (▸/▾) and the optional count in a small pill.

- src/components/SmallIconButton.tsx (optional but recommended for consistency)
  - A minimal icon-only button, reused for remove actions.
  - Props: `label: string` (ARIA), `onClick: () => void`, `title?: string`, `children?: React.ReactNode` (icon char), `disabled?: boolean`.
  - Inline style: 18x18 or 20x20 size, 1px border, minimal padding, monochrome.
  - If we prefer not to create this file, define a shared style object in each page; component is preferred for consistency.

UI changes — detailed per page
1) People page (src/peopleTab.tsx — `PersonPage`)
   - Wrap the entire PROPERTIES block (including the list and the add-new-property UI) with `CollapsibleSection`.
     - Title: "PROPERTIES"
     - Count: total properties (`allPropertyKeys.length`). Optionally show active count instead — out of scope for now.
     - `defaultOpen: true`.
   - Compact the property rows:
     - Container padding: reduce from 12px to 8px (or 6px), keep 2px solid border to match existing design.
     - Font size: reduce label to 12–14px.
     - Toggle square size: reduce from 18px to ~14–16px.
     - Gap between label/toggle/remove: reduce from 12px/8px to ~6–8px.
   - Replace the current remove button with `SmallIconButton` (✕), ~18x18, 1px border, minimal padding. Keep the handler `onRemoveProperty(key)`.
   - Place the add-new-property editor inside the collapsible body so it hides when collapsed.

2) Missions page (src/missionsTab.tsx)
   - Wrap the PROPERTY FILTERS block with `CollapsibleSection`.
     - Title: "PROPERTY FILTERS"
     - Count: number of filters: `Object.keys(currentMission.propertyFilters || {}).length`.
     - `defaultOpen: true`.
   - Compact filter rows similar to People page:
     - Reduce container padding and gap.
     - Reduce the toggle square to ~14–16px; keep the same click behavior (toggle `required`).
     - Replace the REMOVE button with `SmallIconButton` (text "REMOVE" not needed; use ✕ with title tooltip "Remove"). Calls `removeMissionPropertyFilter({ id, propertyKey })`.
   - Keep the "+ ADD PROPERTY FILTER" select within the collapsible body.
   - Optional enhancement: render filters as wrap-around chips instead of full-width rows. If implemented, each chip shows display name and the toggle + ✕. Base version can remain compact rows for minimal diff.

3) Rules page (src/rulesTab.tsx)
   - Mirror Missions page changes in `RulePage`.
     - Title: "PROPERTY FILTERS"
     - Count: `Object.keys(currentRule.propertyFilters || {}).length`.
     - Compact rows and smaller remove button calling `removeRulePropertyFilter`.
     - Keep "+ ADD PROPERTY FILTER" select in the collapsible body.

Shared styling guidelines
- Remain monochrome, keep the existing 2px borders for visual consistency with the app.
- Use inline styles to match the current codebase; avoid introducing a CSS system.
- Button hit area (SmallIconButton) ~18–20px square for usability; keep tooltip via `title`.
- Ensure focus styles remain visible (at least a 2px outline or border change on focus).

Algorithmic/behavior notes
- Collapsible header click toggles a `useState<boolean>` open flag.
- Count computation per section:
  - People: `allPropertyKeys.length` (or active true-properties length if desired later).
  - Missions: `Object.keys(currentMission.propertyFilters || {}).length`.
  - Rules: `Object.keys(currentRule.propertyFilters || {}).length`.
- Toggle logic remains unchanged:
  - People: `onPropertyToggle(person._id, key, person.properties[key] || false)`.
  - Missions: `updateMissionPropertyFilter({ id, propertyKey, required: !filter.required, value: true })`.
  - Rules: `updateRulePropertyFilter({ id, propertyKey, required: !filter.required, value: true })`.
- Remove logic remains unchanged, just bound to the smaller icon button.

Acceptance checklist (dev-facing)
- People/PersonPage properties section collapses/expands, preserving current functionality.
- Missions and Rules property filter sections collapse/expand with accurate count badge.
- Remove buttons are smaller and consistent across all three pages; tooltips present.
- Visual density reduced: smaller paddings, smaller toggles, reduced gaps.
- No regressions in click targets: toggles and remove buttons remain easily clickable.

Phasing (can be done in one pass; listed for clarity)
- Phase 1 (shared): Add `CollapsibleSection` and `SmallIconButton` components.
- Phase 2 (pages): Integrate on `peopleTab.tsx` (PersonPage), then `missionsTab.tsx`, then `rulesTab.tsx`.
- Phase 3 (polish): Optional chip layout for filters, keyboard/focus tweaks, hover states.


