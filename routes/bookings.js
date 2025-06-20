const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');

// Middleware to require login
function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login');
}

// Checkout page
router.get('/checkout', isLoggedIn, async (req, res) => {
  const { roomId, checkIn, checkOut, guests } = req.query;
  const room = await Room.findById(roomId);
  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  const total = nights * room.price;

  res.render('bookings/checkout', {
    room,
    checkIn,
    checkOut,
    guests,
    total,
    user: req.session.user
  });
});

// Confirm booking
router.post('/', isLoggedIn, async (req, res) => {
  const { roomId, checkIn, checkOut, guests, paymentMethod } = req.body;
  const room = await Room.findById(roomId);
  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  const totalPrice = nights * room.price;

  const booking = new Booking({
    user: req.session.user._id,
    room: roomId,
    checkIn,
    checkOut,
    guests,
    totalPrice,
    paymentMethod,
    status: paymentMethod === 'At Hotel' ? 'PENDING' : 'COMPLETED'
  });

  await booking.save();
  res.redirect('/bookings/my');
});

// My bookings
router.get('/my', isLoggedIn, async (req, res) => {
  const bookings = await Booking.find({ user: req.session.user._id }).populate('room');
  res.render('bookings/myBookings', { bookings, user: req.session.user });
});

// Cancel booking
router.get('/cancel/:id', isLoggedIn, async (req, res) => {
  await Booking.findOneAndDelete({ _id: req.params.id, user: req.session.user._id });
  res.redirect('/bookings/my');
});

module.exports = router;
