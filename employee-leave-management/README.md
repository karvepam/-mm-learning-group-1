# Employee Leave Management System

A simple, self-contained Employee Leave Management System built with Node.js, Express, EJS, plain CSS/JavaScript, and SQLite. Employees can log in, apply for leave, and track the status of their leave requests.

## Features

1. **Login** — Employee ID + password authentication, session-based.
2. **Dashboard** — Welcome message and a leave summary (Total / Used / Remaining leaves).
3. **Apply Leave** — Submit a leave request (Casual, Sick, or Earned) with validation. New requests default to `Pending`.
4. **View Leave Status** — Table of every leave request the logged-in employee has submitted, with its current status.

## Tech Stack

- Node.js + Express.js
- EJS templates, plain CSS, vanilla JavaScript
- SQLite via `better-sqlite3`
- `express-session` for session-based authentication
- `bcryptjs` for password hashing

## Project Structure

```
employee-leave-management/
│
├── server.js                 # App entry point (Express setup, sessions, routes)
├── package.json
├── database/
│   ├── db.js                 # SQLite connection, schema creation, seed data
│   └── database.db           # Created automatically on first run (git-ignored)
│
├── routes/
│   ├── auth.js                # /login, /logout, /dashboard
│   └── leave.js                # /apply-leave, /leave-status
│
├── middleware/
│   └── authMiddleware.js      # requireAuth session guard
│
├── models/
│   ├── employeeModel.js       # Employee data access + password verification
│   └── leaveModel.js           # Leave data access + leave summary calculation
│
├── public/
│   ├── css/style.css          # All application styling
│   ├── js/app.js               # Mobile nav toggle + client-side form validation
│   └── images/
│
├── views/
│   ├── partials/
│   │   ├── nav.ejs             # Top navigation bar
│   │   └── flash.ejs           # One-time success/error banner
│   ├── login.ejs
│   ├── dashboard.ejs
│   ├── apply-leave.ejs
│   └── leave-status.ejs
│
└── README.md
```

This follows an MVC-style layout: **models/** (data + business logic), **views/** (EJS templates), and **routes/** + `server.js` acting as the controller layer.

## Database Design

The SQLite database (`database/database.db`) is created automatically on first run by `database/db.js`, which runs the following schema:

```sql
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employeeId TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL
);

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
```

A sample employee is seeded automatically the first time the app starts:

| Employee ID | Password    |
|-------------|-------------|
| EMP001      | password123 |

Passwords are stored hashed with bcrypt — the seed inserts a bcrypt hash of `password123`, never the plain text.

> **Note on leave totals:** the `employees` table intentionally only stores `id` / `employeeId` / `name` / `password` (per the spec). The yearly leave allowance is a policy constant (`TOTAL_LEAVES = 24` in `models/leaveModel.js`), and "Used Leaves" is the sum of days across the employee's `Approved` requests. Adjust `TOTAL_LEAVES` there if you need a different policy.

## Setup Instructions

**Requirements:** Node.js 18+ and npm.

```bash
cd employee-leave-management
npm install
npm start
```

The app will be available at **http://localhost:3000**.

On first run, `database/database.db` is created automatically with the schema above and the sample `EMP001` account.

To use a different port, set the `PORT` environment variable before starting:

```bash
PORT=4000 npm start
```

## Usage

1. Go to `http://localhost:3000` — you'll be redirected to `/login`.
2. Log in with **EMP001** / **password123**.
3. From the **Dashboard**, view your leave summary or use the top navigation to:
   - **Apply Leave** — submit a new leave request.
   - **Leave Status** — view all your past and pending leave requests.
4. Click **Logout** to end your session.

## Notes

- Sessions are stored server-side in memory via `express-session` (fine for local/demo use; swap in a persistent session store for production).
- All form input is validated both client-side (`public/js/app.js`) and server-side (`routes/leave.js`, `routes/auth.js`) — server-side validation is authoritative.
