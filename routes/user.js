const express = require('express');
const router = express.Router();

// Middleware to ensure user is logged in
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login');
}

router.get('/profile', ensureAuth, (req, res) => {
  res.render('user/profile', { user: req.session.user });
});

module.exports = router;
