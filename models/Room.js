const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: String,
    type: String,
    price: Number,
    amenities: [String],
    capacity: Number,
    description: String,
    available: Number
});

module.exports = mongoose.model('Room', roomSchema);
