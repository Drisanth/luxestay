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

  const isAdmin = req.body.isAdmin === 'true'; 
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName,
    mobile,
    address,
    idProofNumber,
    isAdmin,
    isVerified: isAdmin, // 👈 Auto-verify if admin
    verificationToken: isAdmin ? undefined : token
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
   if (user.isBlocked) {
    req.flash('error', 'Your account has been blocked by the admin.');
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

// GET: Reset Password Page
router.get('/reset', (req, res) => {
  res.render('auth/resetPassword', {
    user: null,
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

// POST: Handle Reset Password Submission
router.post('/resetPassword', async (req, res) => {
  const { email, newPassword } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    req.flash('error', 'No account found with that email.');
    return res.redirect('/auth/resetPassword');
  }

  user.password = newPassword; // 🔥 Let pre-save hook hash it
  await user.save();

  req.flash('success', 'Password reset successfully. You can now log in.');
  res.redirect('/auth/login');
});

// GET: Forgot Password Page
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgotPassword', {
    user: null,
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    req.flash('error', 'No account found with that email.');
    return res.redirect('/auth/forgot-password');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  user.resetOTP = otp;
  user.resetOTPExpires = expiry;
  await user.save();

  await transporter.sendMail({
    to: user.email,
    subject: '🔐 LuxeStay Password Reset OTP',
    html: `
      <p>Hello ${user.firstName},</p>
      <p>Your OTP for password reset is:</p>
      <h2>${otp}</h2>
      <p>This OTP will expire in 10 minutes.</p>
    `
  });

  res.render('auth/verifyOtp', { email });
});
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email, resetOTP: otp });

  if (!user || user.resetOTPExpires < Date.now()) {
    req.flash('error', 'Invalid or expired OTP.');
    return res.redirect('/auth/forgot-password');
  }

  // Clear OTP after verification
  user.resetOTP = undefined;
  user.resetOTPExpires = undefined;
  await user.save();

  res.render('auth/newPassword', { 
    email, 
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});

router.post('/reset-password', async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/auth/forgot-password');
  }

  const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    req.flash('error', 'Password must be at least 8 characters with 1 uppercase letter and 1 number.');
    return res.redirect('/auth/forgot-password');
  }

  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/auth/forgot-password');
  }

  user.password = newPassword; // pre-save hook hashes this
  await user.save();

  req.flash('success', 'Password successfully reset. You can now log in.');
  res.redirect('/auth/login');
});
router.get('/new-password', (req, res) => {
  res.render('auth/newPassword', {
    user: null,
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});


// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/rooms');
  });
});

module.exports = router;
