const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();
const User = require('../models/User');

// 🔐 Email transporter setup (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'myprojectscse@gmail.com',
    pass: 'usqvcgqwxujystax' // Consider using environment variable in production
  }
});

// GET: Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { user: req.session.user || null });
});

// POST: Register new user
router.post('/register', async (req, res) => {
  const { username, email, password, firstName, lastName, mobile, address, idProofNumber } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    req.flash('error', 'Email or username already in use');
    return res.redirect('/auth/register');
  }

  const token = crypto.randomBytes(32).toString('hex');

  const user = new User({
    username,
    email,
    password, // 🔒 Hashed via pre-save hook
    firstName,
    lastName,
    mobile,
    address,
    idProofNumber,
    verificationToken: token,
    isVerified: false
  });

  await user.save();

  const verificationURL = `http://localhost:3000/auth/verify/${token}`;
  await transporter.sendMail({
    to: user.email,
    subject: 'LuxeStay Email Verification',
    html: `
      <h3>Welcome to LuxeStay, ${user.firstName}!</h3>
      <p>Please verify your email by clicking below:</p>
      <a href="${verificationURL}">👉 Verify My Email</a>
      <p>This helps us keep your account secure.</p>
    `
  });

  req.flash('success', 'Registration successful! Please check your email to verify your account.');
  res.redirect('/auth/login');
});

// GET: Verify email
router.get('/verify/:token', async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token });

  if (!user) {
    req.flash('error', 'Invalid or expired verification link.');
    return res.redirect('/auth/login');
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  req.flash('success', 'Email verified successfully! You can now log in.');
  res.redirect('/auth/login');
});

// ✅ FIXED: GET Login page (no override of flash messages)
router.get('/login', (req, res) => {
  res.render('auth/login', { user: req.session.user || null });
});

// POST: Login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Invalid credentials');
    return res.redirect('/auth/login');
  }

  if (!user.isVerified) {
    req.flash('error', 'Please verify your email before logging in.');
    return res.redirect('/auth/login');
  }

  req.session.user = user;
  res.redirect(user.isAdmin ? '/admin/dashboard' : '/rooms');
});

// GET: Resend verification form
router.get('/resend-verification', (req, res) => {
  res.render('auth/resendVerification', {
    user: null,
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST: Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    req.flash('error', 'No account found with that email.');
    return res.redirect('/auth/resend-verification');
  }

  if (user.isVerified) {
    req.flash('success', 'Account already verified.');
    return res.redirect('/auth/login');
  }

  const token = crypto.randomBytes(20).toString('hex');
  user.verificationToken = token;
  await user.save();

  const verifyLink = `http://${req.headers.host}/auth/verify/${token}`;
  const mailOptions = {
    from: 'myprojectscse@gmail.com',
    to: user.email,
    subject: '🔒 Verify Your Email - LuxeStay',
    html: `<p>Hello ${user.firstName},</p>
           <p>Please verify your email by clicking the link below:</p>
           <a href="${verifyLink}">${verifyLink}</a>`
  };

  await transporter.sendMail(mailOptions);
  req.flash('success', 'Verification email resent. Please check your inbox.');
  res.redirect('/auth/login');
});

// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/rooms');
  });
});

module.exports = router;
