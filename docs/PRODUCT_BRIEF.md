### Project overview / description

Shifts is a lightweight scheduling and assignment tool for small teams. It lets managers define people with skills/properties, set per‑date UNAVAILABILITY windows (default is available unless marked), create missions (work items) with constraints, and define rules that represent “Unavailable When” periods. It supports repeat patterns and exceptions, and provides calendar views to plan and adjust schedules quickly.

### Target audience

- **Team leads/dispatchers**: Plan shifts and assignments across days/weeks.
- **Small organizations**: Volunteer groups, retail/hospitality teams, security/operations crews.
- **Individual coordinators**: Need a simple, fast way to track availability and recurring patterns.

### Primary benefits / features

- **People management**
  - Add/rename/delete people
  - Boolean properties (skills/tags) with ASCII-safe keys and localized display names (e.g., Hebrew)
  - Per‑date UNAVAILABILITY: full‑day or time‑ranged, 24‑hour input
  - Default assumption: if a date has no entry, the person is available
  - Repeat patterns (day/week/month) with exceptions; stop future repeats; clear exceptions

- **Missions (work items)**
  - Name, optional min/max length
  - Property-based filters: require/forbid properties
  - Per-date scheduling with optional time window
  - Repeat patterns and exceptions, including stop-future capability

- **Rules**
  - Define “UNAVAILABLE WHEN” windows (constraints) with the same time/full‑day options
  - Checked = unavailable; unchecked = available for scheduling
  - Property filters, per‑date unavailability, repeat patterns/exceptions

- **Calendars & UI**
  - Unified calendar grids for people, missions, and rules
  - People and Rules calendars use the same semantics: checked = unavailable; absence = available
  - Infinite-scroll daily view scaffold for events
  - Clear today highlighting, week navigation, quick toggles for unavailability windows

### High-level tech/architecture used

- **Frontend**: React (TypeScript, Vite). Modular UI with tabs: people, missions, rules, calendar. Time inputs and repeat/exception dialogs.
- **Auth**: Clerk. All data is scoped per authenticated user (`userId`). Requires `VITE_CLERK_PUBLISHABLE_KEY`.
- **Backend/Data**: Convex
  - Tables: `people`, `missions`, `rules` (+ legacy `messages`)
  - Semantics: `people.availability[date]` stores `{ unavailable: true, startTime?, endTime? }`; `rules.schedule[date]` stores `{ scheduled: true }` to represent unavailability windows
  - Rich server mutations for list/add/update/delete, property filters, per‑date unavailability/schedule, repeat patterns, exceptions, and bulk stop‑future logic
  - Data isolation via Clerk identity in Convex functions
  - Requires `VITE_CONVEX_URL`

- **Internationalization-friendly properties**: Display names stored separately from ASCII-safe keys to support non-ASCII languages.

This brief reflects the current codebase and is intended to orient contributors to the product scope and architecture.


