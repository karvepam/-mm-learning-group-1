// routes/auth.js
// Login, logout and dashboard routes (the "authenticated home" of the app).

const express = require('express');
const router = express.Router();

const employeeModel = require('../models/employeeModel');
const leaveModel = require('../models/leaveModel');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /login - show the login form (skip straight to dashboard if already logged in)
router.get('/login', (req, res) => {
  if (req.session.employee) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

// POST /login - validate Employee ID + password, start a session
router.post('/login', (req, res) => {
  const { employeeId, password } = req.body;

  if (!employeeId || !password) {
    req.session.flash = { type: 'error', message: 'Employee ID and password are required.' };
    return res.redirect('/login');
  }

  const employee = employeeModel.findByEmployeeId(employeeId.trim());

  if (!employee || !employeeModel.verifyPassword(password, employee.password)) {
    req.session.flash = { type: 'error', message: 'Invalid Employee ID or password.' };
    return res.redirect('/login');
  }

  // Store only what the app needs in the session (never the password hash)
  req.session.employee = {
    id: employee.id,
    employeeId: employee.employeeId,
    name: employee.name,
    role: employee.role || 'Employee',
  };

  res.redirect('/dashboard');
});

// GET /logout - destroy the session and return to the login page
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// GET /dashboard - welcome message + leave summary cards
router.get('/dashboard', requireAuth, (req, res) => {
  const summary = leaveModel.getLeaveSummary(req.session.employee.employeeId);
  res.render('dashboard', {
    employee: req.session.employee,
    summary,
  });
});

module.exports = router;