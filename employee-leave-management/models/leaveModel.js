// models/leaveModel.js
// Data access layer for the leaves table.

const db = require('../database/db');

// Fixed yearly leave quota per employee. The Employees table only stores
// id/employeeId/name/password (per the DB design), so the total leave
// allowance is treated as a company-wide policy constant here rather than
// a per-employee column.
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
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Insert a new leave request with a default status of "Pending".
 * @param {{employeeId: string, leaveType: string, fromDate: string, toDate: string, reason: string}} leave
 * @returns {object} the newly created leave row
 */
function createLeave({ employeeId, leaveType, fromDate, toDate, reason }) {
  const appliedDate = new Date().toISOString().slice(0, 10);

  const result = db
    .prepare(
      `INSERT INTO leaves (employeeId, leaveType, fromDate, toDate, reason, status, appliedDate)
       VALUES (?, ?, ?, ?, ?, 'Pending', ?)`
    )
    .run(employeeId, leaveType, fromDate, toDate, reason, appliedDate);

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
 * Leave summary for the dashboard: total allowance, days used (Approved
 * leaves only) and days remaining.
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
 * All leave requests that are still awaiting a decision, most recent
 * first, together with the requesting employee's name for display.
 * @returns {object[]}
 */
function getPendingLeaves() {
  return db
    .prepare(
      `SELECT leaves.*, employees.name as employeeName
       FROM leaves
       JOIN employees ON leaves.employeeId = employees.employeeId
       WHERE leaves.status = 'Pending'
       ORDER BY leaves.id DESC`
    )
    .all();
}

/**
 * Approve or reject a pending leave request.
 * @param {number} id - leave id
 * @param {{decision: 'Approved'|'Rejected', rejectionReason?: string, approvedBy: string}} decision
 * @returns {object|undefined} the updated leave row, or undefined if the
 *   id does not exist or the leave is no longer Pending.
 */
function decideLeave(id, { decision, rejectionReason, approvedBy }) {
  if (decision !== 'Approved' && decision !== 'Rejected') {
    throw new Error("decision must be 'Approved' or 'Rejected'");
  }
  if (decision === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
    throw new Error('A rejection reason is required when rejecting a leave request.');
  }

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
  if (!leave || leave.status !== 'Pending') {
    return undefined;
  }

  const approvedAt = new Date().toISOString().slice(0, 10);

  db.prepare(
    `UPDATE leaves
     SET status = ?, rejectionReason = ?, approvedBy = ?, approvedAt = ?
     WHERE id = ?`
  ).run(decision, decision === 'Rejected' ? rejectionReason.trim() : null, approvedBy, approvedAt, id);

  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
}

module.exports = {
  TOTAL_LEAVES,
  countDays,
  createLeave,
  getLeavesByEmployeeId,
  getLeaveSummary,
  getPendingLeaves,
  decideLeave,
};
