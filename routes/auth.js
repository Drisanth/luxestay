const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');

// Register
router.get('/register', (req, res) => {
  res.render('auth/register', { user: req.session.user || null });
});

router.post('/register', async (req, res) => {
  const { username, email, password, firstName, lastName, mobile } = req.body;
  const user = new User({ username, email, password, firstName, lastName, mobile });
  await user.save();
  req.session.user = user;
  res.redirect('/rooms');
});

// Login
router.get('/login', (req, res) => {
  res.render('auth/login', { user: req.session.user || null });
});


router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.send('Invalid credentials');
  }

  req.session.user = user;
  res.redirect(user.isAdmin ? '/admin/dashboard' : '/');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/rooms');
  });
});

module.exports = router;
