// routes/leave.js
// Apply Leave and View Leave Status routes.

const express = require('express');
const router = express.Router();

const leaveModel = require('../models/leaveModel');
const employeeModel = require('../models/employeeModel');
const { requireAuth, requireManager } = require('../middleware/authMiddleware');

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned'];

function normalizeDateParam(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseIntId(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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

// GET /leave-status - list leave requests submitted by the logged-in employee with optional filters
router.get('/leave-status', requireAuth, (req, res) => {
  const employeeId = req.session.employee.employeeId;

  const filters = {
    status: (req.query.status || '').trim() || undefined,
    from: normalizeDateParam(req.query.from),
    to: normalizeDateParam(req.query.to),
  };

  const leaves = leaveModel.getLeavesByEmployeeIdFiltered(employeeId, filters);

  // Notification marker: show which rows have status updates since last seen.
  let updatedIds = [];
  let updatesBannerMessage;

  const employeeRecord =
    (employeeModel && typeof employeeModel.getEmployeeById === 'function'
      ? employeeModel.getEmployeeById(employeeId)
      : null) || req.session.employee;

  const lastSeenAt = employeeRecord && employeeRecord.leaveStatusLastSeenAt ? new Date(employeeRecord.leaveStatusLastSeenAt) : null;

  if (lastSeenAt && !Number.isNaN(lastSeenAt.getTime()) && typeof leaveModel.getStatusUpdatesSince === 'function') {
    const updatesSinceLastSeen = leaveModel.getStatusUpdatesSince(employeeId, lastSeenAt) || [];
    if (updatesSinceLastSeen.length > 0) {
      updatedIds = updatesSinceLastSeen
        .map((u) => u.leaveId || u.id || u._id)
        .filter((id) => id !== undefined && id !== null);

      const count = updatesSinceLastSeen.length;
      updatesBannerMessage = `You have ${count} leave request${count === 1 ? '' : 's'} with updated status since your last visit.`;
      // Prefer flash so layout can render consistently, but also pass view var.
      req.session.flash = { type: 'info', message: updatesBannerMessage };
    }
  }

  // Update last seen at to now before render.
  const now = new Date();
  if (employeeModel && typeof employeeModel.updateLeaveStatusLastSeenAt === 'function') {
    employeeModel.updateLeaveStatusLastSeenAt(employeeId, now);
  } else if (employeeModel && typeof employeeModel.updateEmployee === 'function') {
    employeeModel.updateEmployee(employeeId, { leaveStatusLastSeenAt: now });
  } else if (employeeRecord) {
    employeeRecord.leaveStatusLastSeenAt = now;
  }
  if (req.session.employee) {
    req.session.employee.leaveStatusLastSeenAt = now;
  }

  res.render('leave-status', {
    employee: req.session.employee,
    leaves,
    filters,
    updatedIds,
    updatesBannerMessage,
  });
});

// POST /leave/:id/cancel - cancel a pending request owned by the logged-in employee
router.post('/leave/:id/cancel', requireAuth, (req, res) => {
  const id = parseIntId(req.params.id);
  if (!id) {
    req.session.flash = { type: 'error', message: 'Unable to cancel leave request. Please try again.' };
    return res.redirect('/leave-status');
  }

  const employeeId = req.session.employee.employeeId;

  let ok = false;
  if (leaveModel && typeof leaveModel.cancelPendingLeave === 'function') {
    ok = !!leaveModel.cancelPendingLeave({ id, employeeId });
  }

  req.session.flash = ok
    ? { type: 'success', message: 'Leave request cancelled successfully.' }
    : { type: 'error', message: 'Unable to cancel leave request. Please try again.' };

  res.redirect('/leave-status');
});

// POST /leave-requests/:id/cancel - cancel a pending request owned by the logged-in employee
router.post('/leave-requests/:id/cancel', requireAuth, (req, res) => {
  const leaveId = req.params.id;
  const employeeId = req.session.employee.employeeId;

  const leave =
    (typeof leaveModel.getLeaveById === 'function' ? leaveModel.getLeaveById(leaveId) : null) ||
    (typeof leaveModel.getLeave === 'function' ? leaveModel.getLeave(leaveId) : null);

  if (!leave) {
    req.session.flash = { type: 'error', message: 'Leave request not found.' };
    return res.redirect('/leave-status');
  }

  if (leave.employeeId !== employeeId) {
    req.session.flash = { type: 'error', message: 'You are not authorized to cancel this leave request.' };
    return res.redirect('/leave-status');
  }

  if (String(leave.status).toLowerCase() !== 'pending') {
    req.session.flash = { type: 'error', message: 'Only pending leave requests can be cancelled.' };
    return res.redirect('/leave-status');
  }

  let ok = false;
  if (typeof leaveModel.cancelLeave === 'function') {
    ok = !!leaveModel.cancelLeave(leaveId, { cancelledBy: employeeId });
  } else if (typeof leaveModel.updateLeaveStatus === 'function') {
    ok = !!leaveModel.updateLeaveStatus(leaveId, 'Cancelled', { cancelledBy: employeeId });
  } else if (typeof leaveModel.updateLeave === 'function') {
    ok = !!leaveModel.updateLeave(leaveId, { status: 'Cancelled' });
  }

  req.session.flash = ok
    ? { type: 'success', message: 'Leave request cancelled successfully.' }
    : { type: 'error', message: 'Unable to cancel leave request. Please try again.' };

  res.redirect('/leave-status');
});

// Manager views: list pending leaves
router.get('/manager/leave-requests', requireManager, (req, res) => {
  const pendingLeaves = leaveModel.getPendingLeaves();
  res.render('manager-pending.ejs', {
    employee: req.session.employee,
    leaves: pendingLeaves,
  });
});

// POST /leave-requests/:id/approve - approve pending leave
router.post('/leave-requests/:id/approve', requireManager, (req, res) => {
  const leaveId = req.params.id;

  const leave =
    (typeof leaveModel.getLeaveById === 'function' ? leaveModel.getLeaveById(leaveId) : null) ||
    (typeof leaveModel.getLeave === 'function' ? leaveModel.getLeave(leaveId) : null);

  if (!leave) {
    req.session.flash = { type: 'error', message: 'Leave request not found.' };
    return res.redirect('/manager/leave-requests');
  }

  if (String(leave.status).toLowerCase() !== 'pending') {
    req.session.flash = { type: 'error', message: 'Only pending leave requests can be approved.' };
    return res.redirect('/manager/leave-requests');
  }

  let ok = false;
  if (typeof leaveModel.approveLeave === 'function') {
    ok = !!leaveModel.approveLeave(leaveId, { managerId: req.session.employee?.employeeId });
  } else if (typeof leaveModel.updateLeaveStatus === 'function') {
    ok = !!leaveModel.updateLeaveStatus(leaveId, 'Approved', { managerId: req.session.employee?.employeeId });
  } else if (typeof leaveModel.updateLeave === 'function') {
    ok = !!leaveModel.updateLeave(leaveId, { status: 'Approved' });
  }

  req.session.flash = ok
    ? { type: 'success', message: 'Leave request approved.' }
    : { type: 'error', message: 'Unable to approve leave request. Please try again.' };

  res.redirect('/manager/leave-requests');
});

// POST /leave-requests/:id/reject - reject pending leave with a reason
router.post('/leave-requests/:id/reject', requireManager, (req, res) => {
  const leaveId = req.params.id;
  const rejectionReason = (req.body.rejectionReason || '').trim();

  if (!rejectionReason) {
    req.session.flash = { type: 'error', message: 'Rejection reason is required.' };
    return res.redirect('/manager/leave-requests');
  }

  const leave =
    (typeof leaveModel.getLeaveById === 'function' ? leaveModel.getLeaveById(leaveId) : null) ||
    (typeof leaveModel.getLeave === 'function' ? leaveModel.getLeave(leaveId) : null);

  if (!leave) {
    req.session.flash = { type: 'error', message: 'Leave request not found.' };
    return res.redirect('/manager/leave-requests');
  }

  if (String(leave.status).toLowerCase() !== 'pending') {
    req.session.flash = { type: 'error', message: 'Only pending leave requests can be rejected.' };
    return res.redirect('/manager/leave-requests');
  }

  let ok = false;
  if (typeof leaveModel.rejectLeave === 'function') {
    ok = !!leaveModel.rejectLeave(leaveId, rejectionReason, { managerId: req.session.employee?.employeeId });
  } else if (typeof leaveModel.updateLeaveStatus === 'function') {
    ok = !!leaveModel.updateLeaveStatus(leaveId, 'Rejected', {
      rejectionReason,
      managerId: req.session.employee?.employeeId,
    });
  } else if (typeof leaveModel.updateLeave === 'function') {
    ok = !!leaveModel.updateLeave(leaveId, { status: 'Rejected', rejectionReason });
  }

  req.session.flash = ok
    ? { type: 'success', message: 'Leave request rejected.' }
    : { type: 'error', message: 'Unable to reject leave request. Please try again.' };

  res.redirect('/manager/leave-requests');
});

module.exports = router;