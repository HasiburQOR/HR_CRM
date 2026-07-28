# Debug Session: submit-buttons-500
- **Status**: [OPEN]
- **Started**: 2026-07-25
- **Symptoms**:
  1. Attendance "Check In" action fails with HTTP 500.
  2. Submit / Create / Save buttons do not work across Employee, Attendance, Salary, Leave, Task, Reminder, Expense pages.

## Hypotheses (falsifiable)
1. **H1**: Backend `POST /attendances/actions/check-in` crashes at `att.notes = (att.notes or "") + ...` or `str(att.date)` because ORM column default / model field mismatch causes `None` attribute access.
2. **H2**: Frontend TypeScript types (`types/index.ts`) are missing fields or using wrong types (e.g., `employee_id` vs `assigned_to` vs `id`) that cause payloads to be rejected by Pydantic schemas → wrapped as 500 by unhandled ValidationError.
3. **H3**: Service layer `*Service.create()` methods do not map aliases to ORM columns (as the employee service does), leading to SQLAlchemy `TypeError: X is an invalid keyword argument` → 500 across Salary/Leave/Task/Reminder/Expense creates.
4. **H4**: `datetime`/`date` string handling in Pydantic or route is too strict (expecting `datetime.date` objects but receiving strings from JSON), resulting in unhandled `ValueError` in the create path.
5. **H5**: Frontend submit handlers pass entire form objects with `undefined` fields that Axios drops OR serializes incorrectly, causing backend validators to raise for required fields.

## Log Evidence
_To be filled from Debug Server traces._

## Findings
_To be filled after analysis._

## Fix
_To be filled after minimal patch._

## Verified
_Pending user confirmation._
