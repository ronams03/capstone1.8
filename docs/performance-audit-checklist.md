# Performance Audit Checklist

Date: 2026-03-29
Source inspiration: `docs/tiktok-ui-review.md`

## Status Update

Implemented in code:

- shared admin settings auth/session loader
- batched calendar task loading via `project_ids`
- bulk service checklist loading in `api/services.php`
- aggregated task-count joins in `api/projects.php`
- throttled shared-layout focus and visibility refreshes

Verified in this environment:

- `npx tsc --noEmit --pretty false`
- targeted ESLint for the new settings-auth pattern and shared loader
- `php -l` for `api/tasks.php`, `api/services.php`, and `api/projects.php`
- MariaDB `EXPLAIN` checks for project, service, task, and payroll list-query shapes

Still manual:

- React Profiler on `Layout` and `pages/admin/dashboard.tsx` requires browser devtools, so that remains a runtime profiling step rather than a code change

## Goal

Turn the TikTok performance lessons into concrete work for this codebase.

The four themes are:

1. Too many network requests
2. Blocking the main thread
3. Over-rendering components
4. Unoptimized database queries

## Best Things To Apply First

### P0. Remove duplicate session checks from settings pages

Why this matters:

- many settings pages first call `auth.php`
- then make one or more real data requests
- this adds one avoidable request per page load
- the app already has a shared auth helper that can replace most of this pattern

Evidence:

- `components/AuthProvider.tsx:151`
- `pages/settings/account-lockout.tsx:60`
- `pages/settings/intruder-ip-lockout.tsx:64`
- `pages/settings/pagination.tsx:48`
- `pages/settings/deduction-types.tsx:316`

Recommended change:

- migrate settings pages to `useProtectedPage({ allowedRoles: ['admin'] })`
- stop manually calling `auth.php` inside each settings page
- fetch only the page-specific data after auth is already known

Expected result:

- fewer page-load requests
- more consistent redirects
- less duplicate logic across settings pages

### P0. Batch calendar task loading instead of fetching one project at a time

Why this matters:

- opening tasks for a selected date can trigger one request per project
- this is exactly the "too many network requests" problem from the reference

Evidence:

- `pages/dashboard.tsx:148`
- `pages/admin/dashboard.tsx:582`

Current pattern:

- collect project IDs for a date
- call `tasks.php?project_id=...` once per project
- merge the responses in the client

Recommended change:

- add support for `project_ids` in `api/tasks.php`
- fetch all tasks for the selected date projects in one request
- return a single normalized payload

Expected result:

- fewer requests
- faster modal opening
- less frontend orchestration code

### P0. Remove N+1 checklist loading in the services API

Why this matters:

- the backend loops through services and queries checklists separately for each one
- this becomes slower as service count grows

Evidence:

- `api/services.php:186`

Current pattern:

- load all services
- for each service, run another query for its checklists

Recommended change:

- fetch all needed checklists in one query
- group them by `service_id` in PHP
- attach grouped rows after the bulk query

Expected result:

- fewer database round trips
- better scalability
- faster service and dashboard loading

### P1. Replace per-row project count subqueries with aggregated joins

Why this matters:

- the projects list query calculates task counts using correlated subqueries
- that cost repeats for every project row

Evidence:

- `api/projects.php:157`

Current pattern:

- `SELECT COUNT(*) FROM tasks WHERE project_id = p.id`
- `SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed'`

Recommended change:

- pre-aggregate task counts with a grouped subquery or join
- join once per project list query

Expected result:

- lighter project list queries
- better dashboard and project page performance

### P1. Audit shared-layout refresh behavior on focus and visibility changes

Why this matters:

- the shared layout refreshes notifications on focus and visibility changes
- admin users also refresh security alerts
- non-admin users also trigger another auth fetch for lockdown status

Evidence:

- `components/Layout.tsx:291`
- `components/Layout.tsx:358`
- `components/Layout.tsx:431`
- `components/Layout.tsx:517`
- `components/Layout.tsx:548`

Risk:

- multiple refresh requests can fire around the same user action
- the layout is mounted almost everywhere, so small inefficiencies multiply

Recommended change:

- throttle focus/visibility refreshes
- avoid redundant fetches when the previous response is still fresh
- review whether non-admin lockdown status needs a full `auth.php` call on every focus

Expected result:

- lower background request volume
- smoother navigation between tabs and windows

## Codebase Findings By Theme

### 1. Too Many Network Requests

Strong evidence:

- many settings pages do `auth.php` first, then fetch their actual settings data
- dashboard calendar task loading uses one request per project
- some admin/dashboard flows load several resources separately even when the data is tightly related

Examples:

- `pages/settings/account-lockout.tsx:60`
- `pages/settings/intruder-ip-lockout.tsx:64`
- `pages/settings/pagination.tsx:48`
- `pages/settings/deduction-types.tsx:316`
- `pages/dashboard.tsx:159`
- `pages/admin/dashboard.tsx:547`
- `pages/admin/dashboard.tsx:588`

### 2. Blocking The Main Thread

Moderate risk areas:

- large shared layout with many `useEffect` blocks and many open/close handlers
- heavy dashboard pages combining modals, tables, calendar logic, comments, notifications, and filters in one component

Examples:

- `components/Layout.tsx:60`
- `components/Layout.tsx:398`
- `pages/admin/dashboard.tsx:523`

What to check next:

- React Profiler for layout updates
- whether modal state changes cause too much header/sidebar work
- whether large pages should split out more child components

### 3. Over-rendering Components

Strongest frontend candidate:

- `components/Layout.tsx`

Why:

- holds many independent states
- wraps most protected pages
- every state update in the header or overlay area risks rerendering a large shared tree

Other likely candidates:

- `pages/admin/dashboard.tsx`
- `pages/settings/deduction-types.tsx`

Good follow-up:

- split notification center, security alerts, and some modal trees into memoized children
- verify which states really need to live at the top layout level

### 4. Unoptimized Database Queries

Strong evidence:

- N+1 loading in services API
- per-project correlated count subqueries in projects API

Examples:

- `api/services.php:186`
- `api/projects.php:157`

Possible next database checks:

- `api/tasks.php`
- `api/users.php`
- `api/documents.php`
- `api/payroll.php`

These files contain large list queries and joins, so they are good candidates for `EXPLAIN` review next.

## Recommended Implementation Order

### Step 1

Refactor settings pages to use shared auth/session handling.

Target pages first:

- `pages/settings/account-lockout.tsx`
- `pages/settings/intruder-ip-lockout.tsx`
- `pages/settings/pagination.tsx`
- `pages/settings/deduction-types.tsx`

### Step 2

Add a batched task-fetch path for calendar modals.

Targets:

- `api/tasks.php`
- `pages/dashboard.tsx`
- `pages/admin/dashboard.tsx`

### Step 3

Fix the backend N+1 service-checklist loading.

Targets:

- `api/services.php`

### Step 4

Optimize project count queries.

Targets:

- `api/projects.php`

### Step 5

Profile shared-layout rerenders and trim refresh triggers.

Targets:

- `components/Layout.tsx`

## Practical Next Sprint Checklist

- [x] Replace manual settings-page session checks with `useProtectedPage`
- [x] Create a shared admin settings loader pattern
- [x] Add batched `project_ids` support to `api/tasks.php`
- [x] Update dashboard calendar modals to use one task request
- [x] Rewrite `api/services.php?checklists=1` to bulk-load checklists
- [x] Replace project task count subqueries with aggregated joins
- [x] Throttle or cache focus/visibility refreshes in `components/Layout.tsx`
- [ ] Run React Profiler on `Layout` and `admin/dashboard`
- [x] Run `EXPLAIN` on project, service, task, and payroll list queries

## EXPLAIN Snapshot

Local MariaDB data is still small, so some plans correctly choose full scans and filesort even when indexes exist. The important part is that the query shapes are now simplified and the right indexes are available for growth.

Observed highlights:

- `projects` list now joins one grouped `tasks` aggregate instead of running two correlated task-count subqueries per project row
- `service_checklists` has `idx_service_deleted (service_id, is_deleted)`, which matches the new bulk checklist query shape
- `tasks` list batching uses `project_id IN (...)`, which aligns with the existing `tasks.project_id` index
- `payroll` list still sorts by `pay_period_start DESC, created_at DESC`; current local plan is acceptable on tiny data, but a composite sort/filter index can be reviewed later if payroll volume grows

## Short Summary

The TikTok advice maps well to this repo.

The clearest first wins are:

1. reduce duplicate auth and settings requests
2. batch task loading for calendar views
3. remove backend N+1 checklist queries
4. then profile shared-layout rerenders
