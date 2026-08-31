// database/db.js
// Creates/opens the SQLite database file, defines the schema and seeds
// a sample employee account so the app works immediately after `npm install`.

const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

// Enforce foreign key constraints between leaves.employeeId and employees.employeeId
db.pragma('foreign_keys = ON');

// --- Schema -----------------------------------------------------------
// Employees table
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Employee'
  );
`);

// Leaves table
db.exec(`
  CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT NOT NULL,
    leaveType TEXT NOT NULL,
    fromDate TEXT NOT NULL,
    toDate TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    appliedDate TEXT NOT NULL,
    rejectionReason TEXT,
    approvedBy TEXT,
    approvedAt TEXT,
    FOREIGN KEY (employeeId) REFERENCES employees (employeeId)
  );
`);

// --- Migrations ---------------------------------------------------------
// CREATE TABLE IF NOT EXISTS above won't alter a table that already exists
// on disk from before these columns were introduced, so add any missing
// columns here. Safe to run repeatedly (checks PRAGMA table_info first).
function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('employees', 'role', "TEXT NOT NULL DEFAULT 'Employee'");
addColumnIfMissing('leaves', 'rejectionReason', 'TEXT');
addColumnIfMissing('leaves', 'approvedBy', 'TEXT');
addColumnIfMissing('leaves', 'approvedAt', 'TEXT');

// --- Seed data ----------------------------------------------------------
// Seed one sample employee (EMP001 / password123) the first time the app runs.
const existing = db.prepare('SELECT id FROM employees WHERE employeeId = ?').get('EMP001');

if (!existing) {
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.prepare(
    "INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, 'Employee')"
  ).run('EMP001', 'John Doe', hashedPassword);
  console.log('Seeded sample employee EMP001 / password123');
}

// Seed one sample approver (MGR001 / password123) the first time the app runs.
const existingApprover = db.prepare('SELECT id FROM employees WHERE employeeId = ?').get('MGR001');

if (!existingApprover) {
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.prepare(
    "INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, 'Approver')"
  ).run('MGR001', 'Priya Manager', hashedPassword);
  console.log('Seeded sample approver MGR001 / password123');
}

module.exports = db;
