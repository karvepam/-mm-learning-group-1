// models/employeeModel.js
// Data access layer for the employees table. Keeps all SQL for
// employees in one place (MVC "Model").

const bcrypt = require('bcryptjs');
const db = require('../database/db');

/**
 * Find a single employee by their Employee ID.
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

module.exports = {
  findByEmployeeId,
  verifyPassword,
};
