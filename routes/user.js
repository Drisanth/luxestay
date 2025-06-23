const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

const router = express.Router();

// ✅ Middleware: Ensure user is authenticated
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login');
}

// ✅ Multer storage setup for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/avatars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, req.session.user._id + ext);
  }
});

const upload = multer({ storage });

// ✅ GET: Profile page
router.get('/profile', ensureAuth, (req, res) => {
  res.render('user/profile', { user: req.session.user });
});

// ✅ GET: Edit profile page
router.get('/edit', ensureAuth, (req, res) => {
  res.render('user/edit', { user: req.session.user });
});

// ✅ POST: Handle profile edits
router.post('/edit', ensureAuth, upload.single('avatar'), async (req, res) => {
  const {
    firstName,
    lastName,
    username,
    email,
    mobile,
    address,
    idProofNumber
  } = req.body;

  const user = await User.findById(req.session.user._id);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/user/profile');
  }

  user.firstName = firstName;
  user.lastName = lastName;
  user.username = username;
  user.email = email;
  user.mobile = mobile;
  user.address = address;
  user.idProofNumber = idProofNumber;

  // ✅ Handle avatar upload
  if (req.file) {
    user.avatar = req.file.filename;
  }

  await user.save();

  req.session.user = user; // 🔄 Update session
  res.redirect('/user/profile');
});

module.exports = router;
