const express = require('express');
const router = express.Router();
const path = require('path');
const PDFDocument = require('pdfkit');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Coupon = require('../models/Coupon');

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
        user: req.session.user,
        coupon: null // 👈 Add this line to prevent EJS reference error
    });
});

// Validate coupon
router.get('/validate-coupon', isLoggedIn, async (req, res) => {
  const { code, roomId, checkIn, checkOut } = req.query;

  if (!code || !roomId || !checkIn || !checkOut) {
    return res.json({ valid: false });
  }

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true });
  const room = await Room.findById(roomId);

  if (!coupon || new Date(coupon.expiresAt) < new Date()) {
    return res.json({ valid: false });
  }

  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  const total = nights * room.price;
  const discountAmount = (coupon.discount / 100) * total;
  const discountedTotal = total - discountAmount;

  res.json({
    valid: true,
    discount: coupon.discount,
    discountAmount,
    discountedTotal
  });
});


// Confirm booking
router.post('/', isLoggedIn, async (req, res) => {
    const { roomId, checkIn, checkOut, guests, paymentMethod, coupon } = req.body;
    const room = await Room.findById(roomId);
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    let totalPrice = nights * room.price;
    let appliedCoupon = null;

    if (coupon && coupon.trim() !== '') {
        const foundCoupon = await Coupon.findOne({ code: coupon.trim().toUpperCase(), active: true });

        if (foundCoupon && new Date(foundCoupon.expiresAt) > new Date()) {
            const discount = (foundCoupon.discount / 100) * totalPrice;
            totalPrice -= discount;
            appliedCoupon = {
                code: foundCoupon.code,
                discountAmount: discount.toFixed(2),
                discountPercent: foundCoupon.discount
            };
        }
    }

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
    const today = new Date();

    const updatedBookings = bookings.map(b => {
        const checkIn = new Date(b.checkIn);
        const checkOut = new Date(b.checkOut);

        // Dynamically compute actual status
        let actualStatus;
        if (today < checkIn) {
            actualStatus = 'UPCOMING';
        } else if (today >= checkIn && today <= checkOut) {
            actualStatus = 'ONGOING';
        } else {
            actualStatus = 'COMPLETED';
        }

        return {
            ...b.toObject(),
            dynamicStatus: actualStatus
        };
    });

    res.render('bookings/myBookings', { bookings: updatedBookings, user: req.session.user });
});

// Cancel booking
router.get('/cancel/:id', isLoggedIn, async (req, res) => {
    await Booking.findOneAndDelete({ _id: req.params.id, user: req.session.user._id });
    res.redirect('/bookings/my');
});

// 📄 Generate and download invoice with branding and full details
router.get('/:id/invoice', isLoggedIn, async (req, res) => {
  const booking = await Booking.findOne({
    _id: req.params.id,
    user: req.session.user._id
  }).populate('room');

  if (!booking) {
    return res.status(404).send('Booking not found.');
  }

  const doc = new PDFDocument({ margin: 50 });
  const filename = `Invoice-${booking._id}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // 🏨 Hotel branding
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  try {
    doc.image(logoPath, 50, 40, { width: 100 });
  } catch (err) {
    // Skip if logo not found
  }

  doc.fontSize(20).text('LuxeStay Hotels', 160, 50);
  doc.fontSize(12).text('123 Heritage Street, New Delhi, India', 160);
  doc.text('Phone: +91-9876543210 | Email: support@luxestay.com', 160);
  doc.moveDown();

  doc.fontSize(16).text('Booking Invoice', { align: 'right' });
  doc.moveDown();

  // 📋 Booking Info
  doc.fontSize(12).text(`Invoice ID: ${booking._id}`);
  doc.text(`Date Issued: ${new Date().toLocaleDateString()}`);
  doc.moveDown();

  // 👤 Guest Info
  const guest = req.session.user;
  doc.text(`Guest Name: ${guest.firstName} ${guest.lastName}`);
  doc.text(`Email: ${guest.email}`);
  doc.moveDown();

  // 🛏️ Room & Stay Info
  doc.text(`Room Booked: ${booking.room.name}`);
  doc.text(`Stay Duration: ${new Date(booking.checkIn).toDateString()} to ${new Date(booking.checkOut).toDateString()}`);
  doc.text(`Guests: ${booking.guests}`);
  doc.text(`Payment Method: ${booking.paymentMethod}`);
  doc.text(`Booking Status: ${booking.status}`);
  doc.moveDown();

  // 💰 Pricing
  const subtotal = booking.totalPrice / 1.18;
  const gst = booking.totalPrice - subtotal;

  doc.font('Helvetica-Bold').text('Charges Breakdown');
  doc.font('Helvetica');
  doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`);
  doc.text(`GST (18%): ₹${gst.toFixed(2)}`);
  doc.font('Helvetica-Bold').text(`Total: ₹${booking.totalPrice.toFixed(2)}`);
  doc.font('Helvetica');

  doc.moveDown(2);
  doc.fontSize(10).text('Thank you for booking with LuxeStay Hotels.', { align: 'center' });
  doc.text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });

  doc.end();
});


module.exports = router;
