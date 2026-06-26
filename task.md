# System Doctor Tasks

Generated from the latest code health review.

## High Priority Bugs

### 1. Notification double-click behavior is broken
- Type: Bug
- Severity: High
- Status: Open
- Files:
  - `components/Layout.tsx`
  - `pages/notifications.tsx`
- Problem:
  - The notification click delay was reduced to `20ms`, which causes the single-click action to fire before a normal double-click can cancel it.
  - "Double-click to mark unread" will usually open the notification or redirect instead.
- Code References:
  - [Layout.tsx](file:///c:/xampp/htdocs/capstone1/components/Layout.tsx#L923-L940)
  - [notifications.tsx](file:///c:/xampp/htdocs/capstone1/pages/notifications.tsx#L183-L204)
- Suggested Fix:
  - Restore a realistic debounce window for double-click detection, or separate single-click and double-click behavior using a more reliable interaction pattern.

## Medium Priority Bugs

### 2. Manager dashboard shows broken placeholder characters
- Type: Bug
- Severity: Medium
- Status: Open
- File:
  - `pages/manager/dashboard.tsx`
- Problem:
  - The UI renders `â€”` instead of a proper dash placeholder when activity log fields are empty.
- Code Reference:
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/manager/dashboard.tsx#L212-L221)
- Suggested Fix:
  - Replace mojibake strings with ASCII-safe fallback text like `-` or `N/A`.

### 3. Manager dashboard silently hides fetch failures
- Type: Bug
- Severity: Medium
- Status: Open
- File:
  - `pages/manager/dashboard.tsx`
- Problem:
  - Several dashboard fetch functions use empty catch blocks or no-op error handling.
  - Users can end up with stale, partial, or empty data without any visible error message.
- Code Reference:
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/manager/dashboard.tsx#L350-L401)
- Suggested Fix:
  - Surface user-visible loading/failure states and log failures in a consistent way.

## Errors And Reliability Risks

### 4. Admin dashboard turns API failures into fake empty data
- Type: Error Handling
- Severity: Medium
- Status: Open
- File:
  - `pages/admin/dashboard.tsx`
- Problem:
  - `fetchJson()` returns `null` for any failure, and the page then falls back to empty arrays/zero counts.
  - Real API errors look like "no data" instead of a failed load.
- Code References:
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/admin/dashboard.tsx#L309-L315)
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/admin/dashboard.tsx#L349-L369)
- Suggested Fix:
  - Track request failures explicitly and show a warning or retry state for the affected widgets.

### 5. Silent error swallowing exists across many pages
- Type: Error Handling
- Severity: Medium
- Status: Open
- Scope:
  - Multiple pages in `pages/`
- Problem:
  - Repo scan found many `catch {}` or `catch { /* noop */ }` blocks.
  - This hides runtime problems and makes debugging harder.
- Example Reference:
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/manager/dashboard.tsx#L350-L401)
- Suggested Fix:
  - Replace silent catches with structured error handling, fallback states, and optional logging.

## Performance Issues

### 6. Route warmup is wired but disabled
- Type: Performance
- Severity: Medium
- Status: Open
- Files:
  - `components/Sidebar.tsx`
  - `utils/routeWarmup.ts`
- Problem:
  - The sidebar calls warmup functions, but the warmup implementation is intentionally disabled.
  - First navigation to heavy pages remains slower than necessary.
- Code References:
  - [Sidebar.tsx](file:///c:/xampp/htdocs/capstone1/components/Sidebar.tsx#L373-L387)
  - [routeWarmup.ts](file:///c:/xampp/htdocs/capstone1/utils/routeWarmup.ts#L1-L9)
- Suggested Fix:
  - Re-enable safe route prefetching, at least on hover or only in development/desktop contexts.

### 7. Heavy dashboards still block on multiple API calls
- Type: Performance
- Severity: Low
- Status: Open
- Files:
  - `pages/admin/dashboard.tsx`
  - `pages/dashboard.tsx`
  - `pages/manager/dashboard.tsx`
- Problem:
  - Some dashboards request multiple datasets immediately after mount.
  - Even with fast click timing, page content can still feel slow due to data loading.
- Example Reference:
  - [dashboard.tsx](file:///c:/xampp/htdocs/capstone1/pages/admin/dashboard.tsx#L349-L369)
- Suggested Fix:
  - Render shell UI immediately, lazy-load secondary widgets, and cache dashboard datasets where practical.

## Notes
- VS Code diagnostics returned no editor-level TypeScript errors during the review.
- Full repo lint did not complete within the review window, so this list is based on high-confidence inspection findings rather than a full automated lint report.
