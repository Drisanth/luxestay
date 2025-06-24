const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Booking = require('../models/Booking');


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
router.get('/profile', ensureAuth, async (req, res) => {
  const bookings = await Booking.find({ user: req.session.user._id })
    .populate('room')
    .sort({ createdAt: -1 })
    .limit(3); // adjust the limit as needed

  res.render('user/profile', { user: req.session.user, bookings });
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
router.post('/delete', ensureAuth, async (req, res) => {
  const userId = req.session.user._id;

  try {
    // 1. Delete avatar if uploaded
    const user = await User.findById(userId);
    if (user.avatar) {
      const avatarPath = path.join(__dirname, '..', 'public', 'avatars', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    // 2. Delete user's bookings
    await Booking.deleteMany({ user: userId });

    // 3. Delete user account
    await User.findByIdAndDelete(userId);

    // 4. Clear session and redirect
    req.session.destroy(() => {
      res.redirect('/auth/register');
    });
  } catch (err) {
    console.error('❌ Error deleting account:', err);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

module.exports = router;
