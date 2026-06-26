# Debug Session: login-auto-logout

Status: OPEN

## Symptom
- User cannot stay logged in.
- After login, the app redirects back before the dashboard becomes usable.

## Expected
- Successful login should persist session state and route to the correct dashboard.

## Initial Hypotheses
- H1: A stale frontend session check overwrites a fresh authenticated state and triggers a redirect.
- H2: The frontend is calling the wrong backend origin or base path, so auth/session requests fail.
- H3: The PHP backend is unreachable at runtime, so session and security checks return network failures that look like logout.
- H4: The backend accepts login but rejects the follow-up session check because the session cookie is not persisted or not sent.
- H5: A secondary auth-related request such as intruder or lockdown status fails in a way that forces the UI back to an unauthenticated state.

## Evidence Log
- Instrumentation added to:
  - `components/AuthProvider.tsx` for session refresh start/response/error.
  - `pages/index.tsx` for login request, login completion, and login errors.
  - `pages/_app.tsx` for global auth/security fetch response and network errors.

## Instrumentation Plan
- A: Detect stale or conflicting `refreshSession()` outcomes.
- B: Confirm whether login itself succeeds before redirect.
- C: Confirm whether auth/security requests are failing because the PHP backend is offline or unreachable.

## Next Step
- Clear logs and reproduce the issue once to collect `pre-fix` runtime evidence.
