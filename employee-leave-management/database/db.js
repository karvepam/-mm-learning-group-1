// database/db.js
// Creates/opens the SQLite database file, defines the schema and seeds
// sample employee/manager accounts so the app works immediately after `npm install`.

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
    password TEXT NOT NULL
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
    FOREIGN KEY (employeeId) REFERENCES employees (employeeId)
  );
`);

// --- Safe schema migrations (ALTER TABLE guarded by PRAGMA table_info) ---
function getTableColumns(tableName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((c) => c.name);
}

function addColumnIfMissing(tableName, columnName, columnDefinitionSql) {
  const cols = getTableColumns(tableName);
  if (!cols.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinitionSql};`);
  }
}

// employees additions
addColumnIfMissing(
  'employees',
  'role',
  "role TEXT NOT NULL DEFAULT 'Employee'"
);
addColumnIfMissing(
  'employees',
  'leaveStatusLastSeenAt',
  'leaveStatusLastSeenAt TEXT'
);

// leaves additions
addColumnIfMissing('leaves', 'rejectionReason', 'rejectionReason TEXT');
// NOTE: SQLite disallows ALTER TABLE ... ADD COLUMN with a NOT NULL
// column whose default is a non-constant expression (e.g. strftime(...))
// when the table already has rows. Add the column as nullable here and
// backfill existing rows via UPDATE below instead.
addColumnIfMissing(
  'leaves',
  'statusUpdatedAt',
  'statusUpdatedAt TEXT'
);
addColumnIfMissing('leaves', 'cancelledAt', 'cancelledAt TEXT');

// Ensure existing rows have statusUpdatedAt populated (covers pre-migration rows)
try {
  const leavesCols = getTableColumns('leaves');
  if (leavesCols.includes('statusUpdatedAt')) {
    db.prepare(
      "UPDATE leaves SET statusUpdatedAt = strftime('%Y-%m-%d','now') WHERE statusUpdatedAt IS NULL OR statusUpdatedAt = ''"
    ).run();
  }
} catch (e) {
  // No-op: keeps patterns simple and avoids breaking app startup on older/inconsistent DBs
}

// --- Seed data ----------------------------------------------------------
// Seed one sample employee (EMP001 / password123) the first time the app runs.
const existingEmp = db
  .prepare('SELECT id FROM employees WHERE employeeId = ?')
  .get('EMP001');

if (!existingEmp) {
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.prepare(
    'INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, ?)'
  ).run('EMP001', 'John Doe', hashedPassword, 'Employee');
  console.log('Seeded sample employee EMP001 / password123');
}

// Seed one sample manager (MGR001 / password123) the first time the app runs.
const existingMgr = db
  .prepare('SELECT id FROM employees WHERE employeeId = ?')
  .get('MGR001');

if (!existingMgr) {
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.prepare(
    'INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, ?)'
  ).run('MGR001', 'Jane Manager', hashedPassword, 'Manager');
  console.log('Seeded sample manager MGR001 / password123');
}

module.exports = db;