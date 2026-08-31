// middleware/authMiddleware.js
// Protects routes that require a logged-in employee. Reads the employee
// stored in the session by routes/auth.js at login time.

function requireAuth(req, res, next) {
  if (req.session && req.session.employee) {
    return next();
  }
  return res.redirect('/login');
}

// Protects routes that are only for employees with the 'Approver' role
// (e.g. the approvals list and approve/reject actions).
function requireApprover(req, res, next) {
  if (req.session && req.session.employee && req.session.employee.role === 'Approver') {
    return next();
  }
  req.session.flash = { type: 'error', message: 'Access denied. Approver role required.' };
  return res.redirect('/dashboard');
}

module.exports = { requireAuth, requireApprover };
