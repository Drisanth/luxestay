const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount: { type: Number, required: true }, // as percentage
  expiresAt: { type: Date, required: true },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model('Coupon', couponSchema);
