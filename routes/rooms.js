const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Booking = require('../models/Booking');

// GET /rooms - All rooms
router.get('/', async (req, res) => {
  const rooms = await Room.find();
  res.render('rooms/index', { rooms, user: req.session.user || null });
});

// GET /rooms/:id - Room details
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).send('Room not found');
    res.render('rooms/details', { room, user: req.session.user || null });
  } catch (err) {
    res.status(400).send('Invalid room ID');
  }
});

// ✅ NEW: GET /rooms/:id/availability - Return unavailable dates
router.get('/:id/availability', async (req, res) => {
  try {
    const bookings = await Booking.find({ room: req.params.id });

    const unavailableDates = [];
    bookings.forEach(booking => {
      let current = new Date(booking.checkIn);
      const end = new Date(booking.checkOut);

      while (current <= end) {
        unavailableDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    });

    res.json({ unavailableDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

module.exports = router;
