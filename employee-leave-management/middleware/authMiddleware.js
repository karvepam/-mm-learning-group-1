// middleware/authMiddleware.js
// Protects routes that require a logged-in employee. Reads the employee
// stored in the session by routes/auth.js at login time.

function requireAuth(req, res, next) {
  if (req.session && req.session.employee) {
    return next();
  }
  return res.redirect('/login');
}

module.exports = requireAuth;
