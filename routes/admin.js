const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');

const Room = require('../models/Room');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

// 📅 For dashboard chart
const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// ✅ Multer config for saving room images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/images/rooms'));
  },
  filename: function (req, file, cb) {
    // Save as ROOM_ID.jpg (or .png, depending on original)
    cb(null, req.body.roomId + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ✅ Admin check middleware
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
    return next();
  }
  return res.redirect('/auth/login');
}

// ✅ Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
  const bookings = await Booking.find();
  const users = await User.find({ isAdmin: false });

  const stats = {
    revenue: bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    pending: bookings.filter(b => b.status === 'PENDING').length,
    total: bookings.length,
    users: users.length
  };

  const monthData = Array(12).fill(0);
  bookings.forEach(b => {
    const month = new Date(b.checkIn).getMonth();
    monthData[month]++;
  });

  res.render('admin/dashboard', {
    stats,
    chartData: { labels: months, data: monthData },
    user: req.session.user
  });
});

// ✅ Manage Users
router.get('/users', isAdmin, async (req, res) => {
  const users = await User.find({ isAdmin: false });
  res.render('admin/manageUsers', { users, user: req.session.user });
});

// ✅ Manage Bookings
router.get('/bookings', isAdmin, async (req, res) => {
  const bookings = await Booking.find().populate('user room');
  res.render('admin/manageBookings', { bookings, user: req.session.user });
});

// ✅ Manage Coupons
router.get('/coupons', isAdmin, async (req, res) => {
  const coupons = await Coupon.find();
  res.render('admin/manageCoupons', { coupons, user: req.session.user });
});

router.get('/coupons/new', isAdmin, (req, res) => {
  res.render('admin/newCoupon', { user: req.session.user });
});

router.post('/coupons', isAdmin, async (req, res) => {
  const { code, discount, expiresAt } = req.body;
  await Coupon.create({ code, discount, expiresAt });
  res.redirect('/admin/coupons');
});

router.post('/coupons/:id/delete', isAdmin, async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.redirect('/admin/coupons');
});

// ✅ Manage Rooms
router.get('/rooms', isAdmin, async (req, res) => {
  const rooms = await Room.find();
  res.render('admin/manageRooms', { rooms, user: req.session.user });
});
// ✅ Update Booking Status
router.put('/bookings/:id', isAdmin, async (req, res) => {
  const { status } = req.body;

  try {
    await Booking.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error('Failed to update booking:', err);
    res.status(500).send('Error updating booking');
  }
});

router.get('/rooms/new', isAdmin, (req, res) => {
  res.render('admin/newRoom', { user: req.session.user });
});

// ✅ Handle Room Creation → redirect to upload-image
router.post('/rooms', isAdmin, async (req, res) => {
  const { name, type, description, price, capacity, amenities, available } = req.body;
  const newRoom = await Room.create({
    name,
    type,
    description,
    price,
    capacity,
    amenities: amenities.split(',').map(a => a.trim()),
    available
  });

  res.redirect(`/admin/rooms/${newRoom._id}/upload-image`);
});

// ✅ Upload Room Image Form (after creation)
router.get('/rooms/:id/upload-image', isAdmin, async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.redirect('/admin/rooms');
  res.render('admin/uploadRoomImage', { room, user: req.session.user });
});

// ✅ Handle Image Upload
router.post('/rooms/upload-image', isAdmin, upload.single('roomImage'), async (req, res) => {
  // You could update the room here to mark image uploaded if needed
  res.redirect('/admin/rooms');
});

// ✅ Edit Room
router.get('/rooms/:id/edit', isAdmin, async (req, res) => {
  const room = await Room.findById(req.params.id);
  res.render('admin/editRoom', { room, user: req.session.user });
});

router.put('/rooms/:id', isAdmin, async (req, res) => {
  const { name, type, description, price, capacity, amenities, available } = req.body;
  await Room.findByIdAndUpdate(req.params.id, {
    name,
    type,
    description,
    price,
    capacity,
    amenities: amenities.split(',').map(a => a.trim()),
    available
  });
  res.redirect('/admin/rooms');
});

router.delete('/rooms/:id', isAdmin, async (req, res) => {
  await Room.findByIdAndDelete(req.params.id);
  res.redirect('/admin/rooms');
});
// 🔒 Block or Unblock a user
router.post('/users/:id/toggle-block', isAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    user.isBlocked = !user.isBlocked;
    await user.save();
  }
  res.redirect('/admin/users');
});

// 🗑️ Delete user
router.post('/users/:id/delete', isAdmin, async (req, res) => {
  await Booking.deleteMany({ user: req.params.id }); // optional: clean bookings
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});

// 📄 View user summary
router.get('/users/:id/summary', isAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  const bookings = await Booking.find({ user: user._id }).populate('room');

  const today = new Date();
  const updatedBookings = bookings.map(b => {
    const checkIn = new Date(b.checkIn);
    const checkOut = new Date(b.checkOut);

    let dynamicStatus = 'COMPLETED';
    if (today < checkIn) dynamicStatus = 'UPCOMING';
    else if (today <= checkOut) dynamicStatus = 'ONGOING';

    return {
      ...b.toObject(),
      dynamicStatus
    };
  });

  res.render('admin/userSummary', {
    user,
    bookings: updatedBookings
  });
});


module.exports = router;
