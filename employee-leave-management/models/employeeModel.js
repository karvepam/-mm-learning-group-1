// models/employeeModel.js
// Data access layer for the employees table. Keeps all SQL for
// employees in one place (MVC "Model").

const bcrypt = require('bcryptjs');
const db = require('../database/db');

/**
 * Find a single employee by their Employee ID.
 * Includes role and leaveStatusLastSeenAt via SELECT *.
 * @param {string} employeeId
 * @returns {object|undefined}
 */
function findByEmployeeId(employeeId) {
  return db.prepare('SELECT * FROM employees WHERE employeeId = ?').get(employeeId);
}

/**
 * Verify a plain-text password against the employee's stored hash.
 * @param {string} plainPassword
 * @param {string} hashedPassword
 * @returns {boolean}
 */
function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}

/**
 * Update the leave status "last seen" timestamp for an employee.
 * @param {string} employeeId
 * @param {string} isoDateTime - ISO 8601 date-time string
 * @returns {object} - better-sqlite3 run() result
 */
function updateLeaveStatusLastSeenAt(employeeId, isoDateTime) {
  return db
    .prepare('UPDATE employees SET leaveStatusLastSeenAt = ? WHERE employeeId = ?')
    .run(isoDateTime, employeeId);
}

/**
 * Get the leave status "last seen" timestamp for an employee.
 * @param {string} employeeId
 * @returns {string|undefined}
 */
function getLeaveStatusLastSeenAt(employeeId) {
  const row = db
    .prepare('SELECT leaveStatusLastSeenAt FROM employees WHERE employeeId = ?')
    .get(employeeId);
  return row ? row.leaveStatusLastSeenAt : undefined;
}

module.exports = {
  findByEmployeeId,
  verifyPassword,
  updateLeaveStatusLastSeenAt,
  getLeaveStatusLastSeenAt,
};