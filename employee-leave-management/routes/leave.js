// routes/leave.js
// Apply Leave and View Leave Status routes.

const express = require('express');
const router = express.Router();

const leaveModel = require('../models/leaveModel');
const requireAuth = require('../middleware/authMiddleware');

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned'];

// GET /apply-leave - show the leave application form
router.get('/apply-leave', requireAuth, (req, res) => {
  res.render('apply-leave', {
    employee: req.session.employee,
    leaveTypes: LEAVE_TYPES,
    formData: {},
  });
});

// POST /apply-leave - validate input and save the leave request as "Pending"
router.post('/apply-leave', requireAuth, (req, res) => {
  const { employeeId, leaveType, fromDate, toDate, reason } = req.body;
  const errors = [];

  // The Employee ID field is shown read-only on the form, but the value
  // sent from the browser is still checked here so a leave can never be
  // filed under someone else's Employee ID.
  if (!employeeId || employeeId.trim() !== req.session.employee.employeeId) {
    errors.push('Employee ID does not match the logged-in employee.');
  }
  if (!leaveType || !LEAVE_TYPES.includes(leaveType)) {
    errors.push('Please select a valid leave type.');
  }
  if (!fromDate || !toDate) {
    errors.push('Both From Date and To Date are required.');
  } else if (new Date(toDate) < new Date(fromDate)) {
    errors.push('To Date cannot be earlier than From Date.');
  }
  if (!reason || !reason.trim()) {
    errors.push('Please provide a reason for the leave.');
  }

  if (errors.length > 0) {
    return res.status(400).render('apply-leave', {
      employee: req.session.employee,
      leaveTypes: LEAVE_TYPES,
      formData: req.body,
      errors,
    });
  }

  leaveModel.createLeave({
    employeeId: req.session.employee.employeeId,
    leaveType,
    fromDate,
    toDate,
    reason: reason.trim(),
  });

  req.session.flash = { type: 'success', message: 'Leave request submitted successfully.' };
  res.redirect('/leave-status');
});

// GET /leave-status - list every leave request submitted by the logged-in employee
router.get('/leave-status', requireAuth, (req, res) => {
  const leaves = leaveModel.getLeavesByEmployeeId(req.session.employee.employeeId);
  res.render('leave-status', {
    employee: req.session.employee,
    leaves,
  });
});

module.exports = router;
