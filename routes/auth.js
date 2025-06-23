const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');

// GET: Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { user: req.session.user || null });
});

// POST: Register new user
router.post('/register', async (req, res) => {
  const {
    username,
    email,
    password,
    firstName,
    lastName,
    mobile,
    address,
    idProofNumber
  } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    req.flash('error', 'Email or username already in use');
    return res.redirect('/auth/register');
  }

  const user = new User({
    username,
    email,
    password, // Will be hashed in the schema
    firstName,
    lastName,
    mobile,
    address,
    idProofNumber
  });

  await user.save();
  req.session.user = user;
  res.redirect('/rooms');
});

// GET: Login page
router.get('/login', (req, res) => {
  res.render('auth/login', {
    user: req.session.user || null
  });
});

// POST: Login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  });

  if (!user) {
    req.flash('error', 'Invalid credentials');
    return res.redirect('/auth/login');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    req.flash('error', 'Invalid credentials');
    return res.redirect('/auth/login');
  }

  req.session.user = user;
  res.redirect(user.isAdmin ? '/admin/dashboard' : '/');
});

// GET: Password reset form
router.get('/reset', (req, res) => {
  res.render('auth/resetPassword', { user: null });
});

// POST: Password reset
router.post('/reset', async (req, res) => {
  const { email, newPassword } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/auth/reset');
  }

  user.password = newPassword; // Will be hashed in schema
  await user.save();

  req.flash('success', 'Password updated. You can now log in.');
  res.redirect('/auth/login');
});

// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/rooms');
  });
});

module.exports = router;
