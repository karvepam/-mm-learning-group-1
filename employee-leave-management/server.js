// server.js
// Application entry point: wires up Express, sessions, the EJS view
// engine, static assets and the route modules.

const path = require('path');
const express = require('express');
const session = require('express-session');

require('./database/db'); // creates the SQLite file/tables and seeds EMP001 on first run

const authRoutes = require('./routes/auth');
const leaveRoutes = require('./routes/leave');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine ---------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware -----------------------------------------------------------
app.use(express.urlencoded({ extended: true })); // parse HTML form submissions
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'leave-management-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hour session
  })
);

// Makes a one-time flash message (set on req.session.flash by a route)
// available to every view as `flash`, then clears it so it only shows once.
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// --- Routes -----------------------------------------------------------
app.get('/', (req, res) => {
  res.redirect(req.session.employee ? '/dashboard' : '/login');
});

app.use('/', authRoutes);
app.use('/', leaveRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Only start listening when this file is run directly (node server.js).
// When required as a module (e.g. by tests via supertest), just export
// the configured app so the caller can drive it without binding a port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Employee Leave Management System running at http://localhost:${PORT}`);
  });
}

module.exports = app;
