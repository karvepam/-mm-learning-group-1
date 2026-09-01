# Manual QA Checklist: Cancel a Pending Leave Request

Covers EPMCDMETST-105 (story) and its subtasks EPMCDMETST-106 (frontend),
EPMCDMETST-107 (backend) and EPMCDMETST-108 (database). Use this checklist
to manually verify the feature in a browser as a complement to the
automated tests in `tests/cancel.test.js` (EPMCDMETST-109).

## Setup

1. From `employee-leave-management/`, run `npm install` then `npm start`.
2. Open `http://localhost:3000/login` in a browser.
3. Seeded accounts available (see `database/db.js`):
   - Employee: `EMP001` / `password123`
   - Manager: `MGR001` / `password123`
4. If you need a second employee account for the authorization checks
   below, either add one directly to the SQLite `employees` table or
   reuse the account seeded by the automated tests (`EMP002` -- note
   that account only exists in the test DB, not the real one, so for a
   real manual run you will need to insert a second employee row
   yourself, e.g. via a short one-off script that calls the same
   `bcryptjs.hashSync` + `INSERT INTO employees ...` pattern used in
   `database/db.js`).

## AC1 -- Pending requests show a Cancel action

- [ ] Log in as `EMP001`.
- [ ] Submit a new leave request via "Apply Leave" (any dates/reason).
- [ ] Go to "My Leave Requests" (`/leave-status`).
- [ ] Confirm the new request's row shows status `Pending`.
- [ ] Confirm that row's Actions column shows a **Cancel** button.

## AC2 -- Cancelling a Pending request

- [ ] On the same Pending row, click **Cancel**.
- [ ] Confirm a browser confirmation dialog appears (e.g. "Cancel this
      leave request?").
- [ ] Click OK/confirm.
- [ ] Confirm you are redirected back to `/leave-status` and a success
      flash message is shown (e.g. "Leave request cancelled
      successfully.").
- [ ] Confirm the row for that request is **still visible** in the list
      (not removed).
- [ ] Confirm the row's status now shows `Cancelled`.
- [ ] Confirm the Actions column for that row no longer shows a Cancel
      button (shows `-` instead).
- [ ] Reload the page (`F5`) and confirm the status is still `Cancelled`
      after reload (i.e. persisted, not just a client-side change).

## AC3 -- Approved/Rejected requests do not show a Cancel action

- [ ] As `EMP001`, submit a second new leave request.
- [ ] Log out and log in as `MGR001`.
- [ ] Go to the manager pending requests page (`/manager/leave-requests`)
      and **Approve** that request.
- [ ] Log back in as `EMP001`, go to `/leave-status`.
- [ ] Confirm that request's status is `Approved` and its Actions column
      shows `-` (no Cancel button).
- [ ] Submit a third new leave request as `EMP001`.
- [ ] Log in as `MGR001` and **Reject** it (with a rejection reason).
- [ ] Log back in as `EMP001`, go to `/leave-status`.
- [ ] Confirm that request's status is `Rejected`, the rejection reason is
      shown, and its Actions column shows `-` (no Cancel button).

## Edge cases

### Cancel on an already-Approved/Rejected request (backend enforcement)

- [ ] Using a REST client (curl/Postman) or browser dev tools while logged
      in as `EMP001`, send `POST /leave-requests/<id>/cancel` directly for
      the Approved request id from AC3.
- [ ] Confirm you are redirected to `/leave-status` with an error flash
      message (e.g. "Only pending leave requests can be cancelled.").
- [ ] Confirm the request's status is still `Approved` (unchanged).
- [ ] Repeat for the Rejected request id and confirm the same behavior
      (status stays `Rejected`).

### Authorization -- cancelling someone else's request

- [ ] Log in as a second employee account (see Setup).
- [ ] As `EMP001`, note the id of one of your own Pending requests.
- [ ] While logged in as the second employee, send
      `POST /leave-requests/<EMP001's leave id>/cancel` (via dev tools or a
      REST client, since the UI will not normally show this button for
      someone else's request).
- [ ] Confirm you are redirected to `/leave-status` with an error flash
      message (e.g. "You are not authorized to cancel this leave
      request.").
- [ ] Log back in as `EMP001` and confirm that request's status is still
      `Pending` (unchanged).

### Unauthenticated cancel attempt

- [ ] Log out completely.
- [ ] Attempt `POST /leave-requests/<any id>/cancel` (e.g. via curl,
      without a session cookie).
- [ ] Confirm the response redirects to `/login`.
- [ ] Log back in and confirm the target request's status was not
      changed by the attempt.

### Cancel on a non-existent leave id

- [ ] While logged in as `EMP001`, attempt
      `POST /leave-requests/999999/cancel` (an id that does not exist).
- [ ] Confirm the app does not crash/error out (no 500 page).
- [ ] Confirm you are redirected to `/leave-status` with an error flash
      message (e.g. "Leave request not found.").

## Sign-off

- [ ] All boxes above checked.
- [ ] Tester name / date recorded in the PR or ticket comment.
