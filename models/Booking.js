const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    checkIn: Date,
    checkOut: Date,
    guests: Number,
    totalPrice: Number,
    paymentMethod: String,
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' }
});

module.exports = mongoose.model('Booking', bookingSchema);
