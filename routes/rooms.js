const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

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

module.exports = router;
