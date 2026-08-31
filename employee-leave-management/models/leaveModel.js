// models/leaveModel.js
// Data access layer for the leaves table.

const db = require('../database/db');

// Fixed yearly leave quota per employee. The Employees table only stores
// id/employeeId/name/password (per the DB design), so the total leave
// allowance is treated as a company-wide policy constant here rather than
// a per-employee column.
const TOTAL_LEAVES = 24;

// Allowed leave request statuses.
const LEAVE_STATUSES = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
});

/**
 * Number of calendar days a leave request covers (inclusive of both ends).
 * @param {string} fromDate - ISO date string (YYYY-MM-DD)
 * @param {string} toDate - ISO date string (YYYY-MM-DD)
 * @returns {number}
 */
function countDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Insert a new leave request with a default status of "Pending".
 * Sets statusUpdatedAt and ensures rejectionReason/cancelledAt are null.
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    )
    .run(
      employeeId,
      leaveType,
      fromDate,
      toDate,
      reason,
      LEAVE_STATUSES.PENDING,
      appliedDate,
      statusUpdatedAt
    );

  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Find a single leave request by its id.
 * @param {number|string} id
 * @returns {object|undefined}
 */
function getLeaveById(id) {
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
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
 * All leave requests submitted by a given employee with optional filters:
 * - status: exact match
 * - from/to: date range overlap with leave request window
 *
 * Dates are stored as YYYY-MM-DD TEXT, so SQLite string comparisons are valid.
 *
 * Overlap condition:
 * - if both from & to: leave.fromDate <= to AND leave.toDate >= from
 * - if only from: leave.toDate >= from
 * - if only to: leave.fromDate <= to
 *
 * @param {string} employeeId
 * @param {{status?: string, from?: string, to?: string}} filters
 * @returns {object[]}
 */
function getLeavesByEmployeeIdFiltered(employeeId, { status, from, to } = {}) {
  const conditions = ['employeeId = ?'];
  const params = [employeeId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (from && to) {
    conditions.push('fromDate <= ? AND toDate >= ?');
    params.push(to, from);
  } else if (from) {
    conditions.push('toDate >= ?');
    params.push(from);
  } else if (to) {
    conditions.push('fromDate <= ?');
    params.push(to);
  }

  const sql = `SELECT * FROM leaves WHERE ${conditions.join(' AND ')} ORDER BY id DESC`;
  return db.prepare(sql).all(...params);
}

/**
 * Leave summary for the dashboard: total allowance, days used (Approved
 * leaves only) and days remaining.
 * @param {string} employeeId
 * @returns {{total: number, used: number, remaining: number}}
 */
function getLeaveSummary(employeeId) {
  const approvedLeaves = db
    .prepare('SELECT fromDate, toDate FROM leaves WHERE employeeId = ? AND status = ?')
    .all(employeeId, LEAVE_STATUSES.APPROVED);

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
 * Pending leaves list for managers, joined with employees to include employee name.
 * @returns {object[]}
 */
function getPendingLeaves() {
  return db
    .prepare(
      `SELECT
         l.*,
         e.name AS employeeName
       FROM leaves l
       INNER JOIN employees e ON e.employeeId = l.employeeId
       WHERE l.status = ?
       ORDER BY l.id DESC`
    )
    .all(LEAVE_STATUSES.PENDING);
}

/**
 * Approve a leave request only if current status is Pending.
 * Updates statusUpdatedAt.
 * @param {number} id
 * @returns {object|null} updated leave row or null if not updated/not found
 */
function approveLeave(id) {
  const statusUpdatedAt = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE leaves
       SET status = ?,
           rejectionReason = NULL,
           statusUpdatedAt = ?
       WHERE id = ? AND status = ?`
    )
    .run(LEAVE_STATUSES.APPROVED, statusUpdatedAt, id, LEAVE_STATUSES.PENDING);

  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
}

/**
 * Reject a leave request only if current status is Pending.
 * Updates rejectionReason and statusUpdatedAt.
 * @param {number} id
 * @param {string} rejectionReason
 * @returns {object|null} updated leave row or null if not updated/not found
 */
function rejectLeave(id, rejectionReason) {
  const statusUpdatedAt = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE leaves
       SET status = ?,
           rejectionReason = ?,
           statusUpdatedAt = ?
       WHERE id = ? AND status = ?`
    )
    .run(LEAVE_STATUSES.REJECTED, rejectionReason ?? null, statusUpdatedAt, id, LEAVE_STATUSES.PENDING);

  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
}

/**
 * Cancel a leave request only if current status is Pending and belongs to employeeId.
 * Updates cancelledAt and statusUpdatedAt.
 * @param {number} id
 * @param {string} employeeId
 * @returns {object|null} updated leave row or null if not updated/not found
 */
function cancelLeave(id, employeeId) {
  const nowIso = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE leaves
       SET status = ?,
           cancelledAt = ?,
           statusUpdatedAt = ?
       WHERE id = ? AND employeeId = ? AND status = ?`
    )
    .run(LEAVE_STATUSES.CANCELLED, nowIso, nowIso, id, employeeId, LEAVE_STATUSES.PENDING);

  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
}

/**
 * Get leaves for an employee whose status has been updated since the provided timestamp.
 * statusUpdatedAt is stored as ISO date-time TEXT, so lexicographic comparison works.
 * @param {string} employeeId
 * @param {string} lastSeenAt - ISO date-time string
 * @returns {object[]}
 */
function getStatusUpdatesSince(employeeId, lastSeenAt) {
  if (!lastSeenAt) return [];

  return db
    .prepare(
      `SELECT *
       FROM leaves
       WHERE employeeId = ?
         AND statusUpdatedAt > ?
       ORDER BY statusUpdatedAt DESC, id DESC`
    )
    .all(employeeId, lastSeenAt);
}

module.exports = {
  TOTAL_LEAVES,
  LEAVE_STATUSES,
  countDays,
  createLeave,
  getLeaveById,
  getLeavesByEmployeeId,
  getLeavesByEmployeeIdFiltered,
  getLeaveSummary,
  getPendingLeaves,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getStatusUpdatesSince,
};