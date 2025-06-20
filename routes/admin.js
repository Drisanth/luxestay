const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
// Admin check middleware
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
    return next();
  }
  return res.redirect('/auth/login');
}
// Admin Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
  const bookings = await Booking.find();
  const users = await User.find({ isAdmin: false });

  const stats = {
    revenue: bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    pending: bookings.filter(b => b.status === 'PENDING').length,
    total: bookings.length,
    users: users.length
  };

  // chart data
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

// Manage Users
router.get('/users', isAdmin, async (req, res) => {
  const users = await User.find({ isAdmin: false });
  res.render('admin/manageUsers', { users, user: req.session.user });
});

// Manage Bookings
router.get('/bookings', isAdmin, async (req, res) => {
  const bookings = await Booking.find().populate('user room');
  res.render('admin/manageBookings', { bookings, user: req.session.user });
});

// View all coupons
router.get('/coupons', isAdmin, async (req, res) => {
  const coupons = await Coupon.find();
  res.render('admin/manageCoupons', { coupons, user: req.session.user });
});

// Show form to add new coupon
router.get('/coupons/new', isAdmin, (req, res) => {
  res.render('admin/newCoupon', { user: req.session.user });
});

// Add coupon
router.post('/coupons', isAdmin, async (req, res) => {
  const { code, discount, expiresAt } = req.body;
  await Coupon.create({ code, discount, expiresAt });
  res.redirect('/admin/coupons');
});

// Delete coupon
router.post('/coupons/:id/delete', isAdmin, async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.redirect('/admin/coupons');
});

// View all room types
router.get('/rooms', isAdmin, async (req, res) => {
  const rooms = await Room.find();
  res.render('admin/manageRooms', { rooms, user: req.session.user });
});

// Show form to add new room
router.get('/rooms/new', isAdmin, (req, res) => {
  res.render('admin/newRoom', { user: req.session.user });
});

// Handle room creation
router.post('/rooms', isAdmin, async (req, res) => {
  const { name, type, description, price, capacity, amenities, available } = req.body;
  await Room.create({
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

// Edit form
router.get('/rooms/:id/edit', isAdmin, async (req, res) => {
  const room = await Room.findById(req.params.id);
  res.render('admin/editRoom', { room, user: req.session.user });
});

// Update room
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

// Delete room
router.delete('/rooms/:id', isAdmin, async (req, res) => {
  await Room.findByIdAndDelete(req.params.id);
  res.redirect('/admin/rooms');
});

module.exports = router;
