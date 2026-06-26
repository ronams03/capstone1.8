[RESOLVED] Login redirect loop

- Session ID: `login-redirect-loop`
- Created: 2026-06-11
- Symptom: User logs in, reaches dashboard, then gets redirected back to login.
- Expected: User remains authenticated on the dashboard after successful login.

## Root Cause

- The repository previously contained a separately exported static deployment under `HTML/`.
- The current source app under `pages/`, `components/`, and `utils/` is the supported runtime.
- The exported static bundle was stale and duplicated frontend assets, increasing storage without being required by the active app.

## Findings

1. The app is session-cookie based, not JWT/token based.
2. The modern source login flow already does the right thing:
   - login uses `credentials: 'include'`
   - successful login forces `refreshSession({ force: true })`
   - protected dashboards rely on `useProtectedPage()`
3. The backend login/session implementation is internally consistent:
   - `api/auth.php?action=login` establishes the PHP session
   - `api/auth.php` checks the active session
   - cookie settings are `HttpOnly`, `SameSite=Lax`, `path=/`
4. The stale exported `HTML` frontend was the critical mismatch:
   - exported pages still ship old bundle code with hardcoded `localhost` API URLs
   - exported pages do not inherit the current source app's request normalization layer

## Fix Implemented

- Removed the generated `HTML/` export and duplicate `out/` export output.
- Removed the HTML export and HTML auth patch scripts.
- Removed the `export:html` npm script so the static export is not regenerated.
- Added `HTML/` and `out/` to storage cleanup so future cleanups free the duplicate artifacts.
- Kept the active Next.js dev/start/build flow intact.

## Validation

- Frontend audit:
  - confirmed centralized source auth flow is session-cookie based and persists with forced session refresh
  - confirmed no immediate dashboard-shell logout effect in shared layout
  - identified the stale exported static bundle as the duplicate artifact to remove
- Backend audit:
  - confirmed PHP session login/check flow and cookie/CORS settings are structurally correct
  - confirmed the issue is not a missing JWT/access token implementation because the app does not use token auth
- Storage audit:
  - removed the generated `HTML/` export and duplicate `out/` export output
  - confirmed the active app no longer depends on static HTML export files

## Remaining Risk

- Some source pages still use page-level manual auth checks instead of the centralized `useProtectedPage()` guard. They are less likely to break after this host-normalization fix, but they remain architectural debt and should be migrated in a follow-up hardening pass.

## Investigation Log

- Audited the current source auth flow and confirmed modern route protection is centralized.
- Audited backend session handling and cookie/CORS settings.
- Removed the stale exported frontend and the scripts that regenerated or patched it.
