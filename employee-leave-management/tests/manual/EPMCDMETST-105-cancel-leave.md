# EPMCDMETST-105 — Cancel Pending Leave — Manual Test Script

## Pre-requisites
- App is running: `npm start` (default http://localhost:3000)
- Sample user exists (seeded): **EMP001 / password123**

## Test Cases

### TC1 — Cancel button appears only for Pending requests
1. Login as EMP001
2. Go to **Apply Leave**
3. Submit a valid leave request
4. Navigate to **Leave Status**

**Expected**
- The new row shows **Status = Pending**
- The **Cancel** button is visible in the **Actions** column

### TC2 — Cancel a Pending request successfully
1. From **Leave Status**, click **Cancel** on a Pending request
2. Confirm the browser confirmation dialog

**Expected**
- A success flash message appears (e.g., "Leave request cancelled.")
- The row status becomes **Cancelled**
- The Cancel action is no longer available for that row

### TC3 — Cannot cancel a non-Pending request (server-side validation)
> This test is easiest by temporarily changing a row status in SQLite.

1. Stop the server
2. Open SQLite DB `employee-leave-management/database/database.db`
3. Update a leave row to `Approved` (or `Rejected`):

```sql
UPDATE leaves SET status = 'Approved' WHERE id = <someLeaveId>;
```

4. Start server and login
5. Go to **Leave Status**

**Expected**
- For Approved/Rejected rows, Actions column shows `-` (no Cancel button)

6. (Optional) Attempt to POST directly:

```bash
curl -i -X POST http://localhost:3000/leave/<id>/cancel
```

**Expected**
- Request should not cancel the leave
- User gets an error flash message after redirect (when using browser)

### TC4 — Cannot cancel someone else’s request (ownership check)
> Requires another employee record and a leave under that employeeId.

1. Insert another employee and a leave for them in SQLite
2. Login as EMP001
3. Attempt to cancel the other employee’s leave by POSTing to `/leave/<theirId>/cancel`

**Expected**
- Leave is not cancelled
- Error flash message is shown

## Notes
- This enhancement adds a new status value: `Cancelled`.
- Dashboard leave summary should remain unchanged because it only counts `Approved` leaves.
