const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  firstName: String,
  lastName: String,
  mobile: String,
  address: String,               // ✅ New
  idProofNumber: String,         // ✅ New
  avatar: String,                // Already added earlier
  isAdmin: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  isBlocked: { type: Boolean, default: false },
  resetOTP: String,
  resetOTPExpires: Date,
});

// Password hashing middleware
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model('User', userSchema);
