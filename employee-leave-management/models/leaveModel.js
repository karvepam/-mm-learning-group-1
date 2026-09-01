// models/leaveModel.js
// Data access layer for the leaves table.
// Clean, minimal API surface used by the current app.

const db = require('../database/db');

// Fixed yearly leave quota per employee.
const TOTAL_LEAVES = 24;

/**
 * Number of calendar days a leave request covers (inclusive of both ends).
 * @param {string} fromDate - ISO date string (YYYY-MM-DD)
 * @param {string} toDate - ISO date string (YYYY-MM-DD)
 * @returns {number}
 */
function countDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;

  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Insert a new leave request with a default status of "Pending".
 * Sets appliedDate and statusUpdatedAt and ensures rejectionReason/cancelledAt are null.
 * @param {{employeeId: string, leaveType: string, fromDate: string, toDate: string, reason: string}} leave
 * @returns {object} the newly created leave row
 */
function createLeave({ employeeId, leaveType, fromDate, toDate, reason }) {
  const appliedDate = new Date().toISOString().slice(0, 10);
  const statusUpdatedAt = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO leaves (
         employeeId,
         leaveType,
         fromDate,
         toDate,
         reason,
         status,
         appliedDate,
         statusUpdatedAt,
         rejectionReason,
         cancelledAt
       )
       VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, NULL, NULL)`
    )
    .run(employeeId, leaveType, fromDate, toDate, reason, appliedDate, statusUpdatedAt);

  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * All leave requests submitted by a given employee, most recent first.
 * @param {string} employeeId
 * @returns {object[]}
 */
function getLeavesByEmployeeId(employeeId) {
  return db
    .prepare('SELECT * FROM leaves WHERE employeeId = ? ORDER BY id DESC')
    .all(employeeId);
}

/**
 * Leave summary for the dashboard: total allowance, days used (Approved leaves only) and days remaining.
 * @param {string} employeeId
 * @returns {{total: number, used: number, remaining: number}}
 */
function getLeaveSummary(employeeId) {
  const approvedLeaves = db
    .prepare("SELECT fromDate, toDate FROM leaves WHERE employeeId = ? AND status = 'Approved'")
    .all(employeeId);

  const used = approvedLeaves.reduce(
    (sum, leave) => sum + countDays(leave.fromDate, leave.toDate),
    0
  );

  return {
    total: TOTAL_LEAVES,
    used,
    remaining: Math.max(TOTAL_LEAVES - used, 0),
  };
}

/**
 * Fetch a leave request by its primary key.
 * @param {number} id
 * @returns {object|undefined}
 */
function getLeaveById(id) {
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
}

/**
 * Cancel a pending leave request for the provided employee.
 * @param {{id: number, employeeId: string}} params
 * @returns {{ok: true} | {ok: false, reason: 'not_found'|'forbidden'|'not_pending'}}
 */
function cancelPendingLeave({ id, employeeId }) {
  const leave = getLeaveById(id);
  if (!leave) return { ok: false, reason: 'not_found' };
  if (leave.employeeId !== employeeId) return { ok: false, reason: 'forbidden' };
  if (leave.status !== 'Pending') return { ok: false, reason: 'not_pending' };

  const result = db
    .prepare("UPDATE leaves SET status = 'Cancelled' WHERE id = ? AND employeeId = ? AND status = 'Pending'")
    .run(id, employeeId);

  return result.changes === 1 ? { ok: true } : { ok: false, reason: 'not_pending' };
}

/**
 * Fetch a leave request row by its primary key.
 * @param {number} id
 * @returns {object|null}
 */
function getLeaveById(id) {
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id) ?? null;
}

/**
 * Cancel a pending leave request if it belongs to employeeId.
 * Also updates cancelledAt and statusUpdatedAt when available in schema.
 * @param {{id: number, employeeId: string}} params
 * @returns {{ok: true} | {ok: false, reason: 'not_found'|'forbidden'|'not_pending'}}
 */
function cancelPendingLeave({ id, employeeId }) {
  const leave = getLeaveById(id);

  if (!leave) return { ok: false, reason: 'not_found' };
  if (leave.employeeId !== employeeId) return { ok: false, reason: 'forbidden' };
  if (leave.status !== 'Pending') return { ok: false, reason: 'not_pending' };

  const nowIso = new Date().toISOString();

  // Prefer updating cancelledAt/statusUpdatedAt if columns exist; fall back to status-only update.
  try {
    const result = db
      .prepare(
        `UPDATE leaves
         SET status = 'Cancelled',
             cancelledAt = ?,
             statusUpdatedAt = ?
         WHERE id = ? AND employeeId = ? AND status = 'Pending'`
      )
      .run(nowIso, nowIso, id, employeeId);

    return result.changes === 1 ? { ok: true } : { ok: false, reason: 'not_pending' };
  } catch (err) {
    const result = db
      .prepare(
        `UPDATE leaves
         SET status = 'Cancelled'
         WHERE id = ? AND employeeId = ? AND status = 'Pending'`
      )
      .run(id, employeeId);

    return result.changes === 1 ? { ok: true } : { ok: false, reason: 'not_pending' };
  }
}

module.exports = {
  TOTAL_LEAVES,
  countDays,
  createLeave,
  getLeavesByEmployeeId,
  getLeaveSummary,
  getLeaveById,
  cancelPendingLeave,
};
