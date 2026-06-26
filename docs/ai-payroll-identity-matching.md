# AI Payroll Identity Matching

## Purpose

This document explains how the system should identify the correct employee during payroll import when:

- the employee list in the system is sorted alphabetically
- the Excel payroll file uses its own numbering like `1`, `2`, `3`
- the system's internal `employee_id` does not match the Excel number
- names, roles, and attendance data may differ slightly between systems

The goal is to let AI assist payroll matching without making unsafe payroll decisions from a single field.

## Problem

The employee list shown in the app is a visual list. It is not a payroll identity source.

Example:

- The system sorts employees alphabetically.
- A newly added employee named `Aaron Cruz` may appear first in the employee list.
- The payroll Excel may show `1` for the admin.
- The admin may actually be `employee_id = 5` in the database.

This means:

- `first in the list` is not the same as `employee_id = 1`
- `Excel number 1` is not automatically the same as `employee_id = 1`
- using only names is also risky because names can be duplicated, misspelled, shortened, or formatted differently

## Key Rule

AI should not use only one signal.

AI should match employees using multiple signals together:

- imported Excel ID or code
- imported name
- employee role
- position
- branch
- attendance pattern
- previous payroll history
- previous confirmed mappings
- employee status

The system should treat this as **identity resolution**, not just simple ID matching or simple name matching.

## Why ID Only Is Not Enough

If the import uses only `EmployeeID`, the system can fail when:

- the biometric or payroll system uses a different ID format
- the external file starts numbering from `1`
- the admin is `1` in Excel but `5` in the system
- a new employee changes alphabetical ordering in the UI

## Why Name Only Is Not Enough

If the import uses only names, the system can fail when:

- two employees have similar or identical names
- a file uses nicknames, initials, or abbreviations
- names have spelling errors
- admins or system users have different display names
- surnames change over time

## Recommended Design

### 1. Keep Internal Identity Stable

The database should continue using the internal `employee_id` as the real employee key.

That key should never depend on:

- UI order
- alphabetical sorting
- Excel row number
- guessed name similarity alone

### 2. Add External Identity Mapping

Create a mapping layer for imported payroll and attendance sources.

Suggested table:

`employee_identity_map`

Fields:

- `id`
- `employee_id`
- `source_system`
- `external_employee_code`
- `external_employee_name`
- `match_status`
- `confidence_score`
- `verified_by`
- `verified_at`
- `created_at`
- `updated_at`

Example:

- `source_system = payroll_excel`
- `external_employee_code = 1`
- `external_employee_name = Admin John`
- `employee_id = 5`

This means the Excel's `1` is permanently mapped to the correct system employee.

### 3. Let AI Assist Matching

When a payroll row is imported, AI should score possible employee matches using multiple signals.

Example scoring inputs:

- name similarity
- role match
- branch match
- position match
- historical attendance similarity
- previous confirmed mapping
- recent payroll ownership for similar rows

Example result:

- Candidate A: `employee_id = 5`, confidence `0.94`
- Candidate B: `employee_id = 1`, confidence `0.31`

The system should choose the best candidate only if confidence is high enough.

### 4. Use Confidence Thresholds

Recommended behavior:

- `0.95 to 1.00`: auto-match allowed
- `0.75 to 0.94`: manager review required
- below `0.75`: do not import automatically

This keeps payroll safe while still making AI useful.

### 5. Save Confirmed Matches

After a manager confirms a match once, save it in `employee_identity_map`.

Future imports from the same source should use the saved mapping first before asking AI again.

This turns a one-time manual check into future automation.

## Recommended Import Flow

1. Upload payroll or attendance Excel file.
2. Parse row data.
3. Check if a saved mapping already exists for `source_system + external_employee_code`.
4. If a mapping exists, use the mapped `employee_id`.
5. If no mapping exists, run AI matching against active employees.
6. If confidence is high, propose the match.
7. If confidence is medium or conflicting, send the row to review.
8. Once approved, save the mapping.
9. Generate draft payroll only after identity is confirmed.

## Example Scenario

System data:

- `employee_id = 5`
- name = `John Reyes`
- role = `admin`

Excel data:

- number = `1`
- name = `Admin John`
- attendance = regular admin attendance pattern

Expected AI reasoning:

- Excel `1` is not trusted as the internal DB ID
- name similarity points to `John Reyes`
- role matches `admin`
- historical attendance pattern matches the admin record
- previous imports may confirm the same person

Result:

- AI suggests `employee_id = 5`
- manager confirms once
- system saves `payroll_excel:1 -> employee_id 5`

## Rules For Safety

- Never use UI list position as payroll identity.
- Never use alphabetical order as payroll identity.
- Never generate payroll for uncertain matches without review.
- Never let AI silently overwrite an existing confirmed mapping.
- Always keep a review trail for payroll identity decisions.

## Recommended UI Additions

Suggested payroll import review screen fields:

- Excel code
- Excel name
- suggested employee
- confidence score
- matched signals
- conflicting signals
- approve mapping
- reject mapping
- search employee manually

This gives managers visibility into why AI picked a person.

## Current Implementation Notes

The current project implementation now supports:

- Base44-backed identity map lookup during attendance import
- source-system selection during payroll import
- optional Excel columns for `EmployeeName`, `Role`, and `Branch`
- smart fallback matching when no confirmed Base44 mapping is found
- automatic skipping of ambiguous rows instead of creating payroll for the wrong employee

### Required Server Environment Variables

To enable Base44 mapping lookup in the PHP import layer, configure:

- `BASE44_APP_ID`
- `BASE44_API_KEY`
- `BASE44_EMPLOYEE_IDENTITY_ENTITY`

Recommended default entity name:

- `EmployeeIdentityMap`

The current implementation also supports a local PHP config fallback:

- `config/base44.php`

You can place the Base44 app ID and API key there if setting Apache/PHP environment variables is not convenient.

If the Base44 configuration is missing or unavailable:

- confirmed Base44 mappings will not be used
- the importer will rely only on local smart matching
- rows without enough identity signals may be skipped for safety

## Summary

The correct solution is not:

- ID only
- name only
- alphabetical order

The correct solution is:

- internal stable employee key
- external source mapping
- AI multi-factor matching
- manager confirmation for uncertain cases
- saved mapping for future imports

This approach is safer, smarter, and practical for payroll operations.
