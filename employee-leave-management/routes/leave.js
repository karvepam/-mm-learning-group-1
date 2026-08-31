// routes/leave.js
// Apply Leave, View Leave Status and Approver routes.

const express = require('express');
const router = express.Router();

const leaveModel = require('../models/leaveModel');
const { requireAuth, requireApprover } = require('../middleware/authMiddleware');

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned'];

// GET /apply-leave - show the leave application form
router.get('/apply-leave', requireAuth, (req, res) => {
  const summary = leaveModel.getLeaveSummary(req.session.employee.employeeId);
  res.render('apply-leave', {
    employee: req.session.employee,
    leaveTypes: LEAVE_TYPES,
    formData: {},
    summary,
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

  // Only check the leave balance once the dates themselves are valid -
  // countDays() on an invalid/missing date range would be meaningless.
  if (errors.length === 0) {
    const requestedDays = leaveModel.countDays(fromDate, toDate);
    const { remaining } = leaveModel.getLeaveSummary(req.session.employee.employeeId);

    if (requestedDays > remaining) {
      errors.push(
        `Requested ${requestedDays} day(s) exceeds your remaining balance of ${remaining} day(s).`
      );
    }
  }

  if (errors.length > 0) {
    const summary = leaveModel.getLeaveSummary(req.session.employee.employeeId);
    return res.status(400).render('apply-leave', {
      employee: req.session.employee,
      leaveTypes: LEAVE_TYPES,
      formData: req.body,
      errors,
      summary,
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

// GET /approvals - show every leave request that is still Pending (Approver only)
router.get('/approvals', requireAuth, requireApprover, (req, res) => {
  const pendingLeaves = leaveModel.getPendingLeaves();
  res.render('approvals', {
    employee: req.session.employee,
    pendingLeaves,
  });
});

// POST /approvals/:id/decision - approve or reject a pending leave request (Approver only)
router.post('/approvals/:id/decision', requireAuth, requireApprover, (req, res) => {
  const { decision, rejectionReason } = req.body;
  const id = req.params.id;

  const decisionMap = { Approve: 'Approved', Reject: 'Rejected' };
  const mappedDecision = decisionMap[decision];

  if (!mappedDecision) {
    req.session.flash = { type: 'error', message: 'Please choose Approve or Reject.' };
    return res.redirect('/approvals');
  }

  if (mappedDecision === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
    req.session.flash = { type: 'error', message: 'A rejection reason is required to reject a request.' };
    return res.redirect('/approvals');
  }

  const updated = leaveModel.decideLeave(id, {
    decision: mappedDecision,
    rejectionReason,
    approvedBy: req.session.employee.employeeId,
  });

  if (!updated) {
    req.session.flash = { type: 'error', message: 'That leave request could not be found or was already decided.' };
    return res.redirect('/approvals');
  }

  req.session.flash = { type: 'success', message: `Leave request #${id} has been ${mappedDecision.toLowerCase()}.` };
  res.redirect('/approvals');
});

module.exports = router;
