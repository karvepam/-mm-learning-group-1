// middleware/authMiddleware.js
// Protects routes that require a logged-in employee. Reads the employee
// stored in the session by routes/auth.js at login time.

function requireAuth(req, res, next) {
  if (req.session && req.session.employee) {
    return next();
  }
  return res.redirect('/login');
}

function requireManager(req, res, next) {
  if (req.session && req.session.employee && req.session.employee.role === 'Manager') {
    return next();
  }

  if (req.flash) {
    req.flash('error', 'You do not have permission to access that page.');
  }

  return res.redirect('/dashboard');
}

module.exports = {
  requireAuth,
  requireManager,
};