# Admin Dashboard And UI Fixes Task

Requested: 2026-06-19

## Scope

- Make the admin dashboard match the manager dashboard structure and styling.
- Fix password policy persistence so the password age setting does not reset to the 90-day default after reload.
- Standardize action buttons across pages so labels, spacing, wrapping, and icon-only controls are clear and do not overlap.
- Add missing filters to pages that expose tabular/list data.
- Repair broken buttons and action controls across affected pages.
- Preserve sidebar scroll position across route changes so the menu stays where the user left it.

## Checklist

- [ ] Inspect dashboard layouts, shared layout components, settings APIs, and action button patterns.
- [ ] Update admin dashboard to follow the manager dashboard UI pattern.
- [ ] Fix password age load/save behavior in the password policy page and API/data layer if needed.
- [ ] Create or update shared action button styles/components for consistent labels, alignment, and responsive behavior.
- [ ] Apply button fixes to affected pages.
- [ ] Add missing filters to list/table pages that do not currently have them.
- [ ] Fix broken action buttons found during page review.
- [ ] Preserve sidebar scroll position across navigation.
- [ ] Run type/lint/build checks where practical.
- [ ] Smoke-test important pages after changes.

## Notes

- Keep changes aligned with the existing Next.js pages/components/styles structure.
- Avoid unrelated refactors while repairing the requested UI and behavior issues.
