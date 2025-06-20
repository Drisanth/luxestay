const express = require('express');
const router = express.Router();
const path = require('path');
const PDFDocument = require('pdfkit');
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

// 📄 Generate and download invoice with branding and GST
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

    // 🏨 Branding (Logo + Hotel Name)
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    try {
        doc.image(logoPath, 50, 40, { width: 100 });
    } catch (err) {
        // Logo optional: skip if not found
    }

    doc.fontSize(22).text('LuxeStay Hotels', 160, 50);
    doc.moveDown();
    doc.fontSize(14).text('Booking Invoice', { align: 'right' });
    doc.moveDown(2);

    // 📦 Booking & Guest Info
    doc.fontSize(12).text(`Booking ID: ${booking._id}`);
    doc.text(`Guest: ${req.session.user.firstName} ${req.session.user.lastName}`);
    doc.text(`Email: ${req.session.user.email}`);
    doc.text(`Room: ${booking.room.name}`);
    doc.text(`Check-in: ${new Date(booking.checkIn).toDateString()}`);
    doc.text(`Check-out: ${new Date(booking.checkOut).toDateString()}`);
    doc.text(`Guests: ${booking.guests}`);
    doc.text(`Payment Method: ${booking.paymentMethod}`);
    doc.text(`Status: ${booking.status}`);
    doc.moveDown();

    // 💰 Price Breakdown with GST (18%)
    const subtotal = booking.totalPrice / 1.18;
    const gst = booking.totalPrice - subtotal;

    doc.text(`Subtotal: $${subtotal.toFixed(2)}`);
    doc.text(`GST (18%): $${gst.toFixed(2)}`);
    doc.font('Helvetica-Bold').text(`Total: $${booking.totalPrice.toFixed(2)}`);
    doc.font('Helvetica');

    // 📅 Footer
    doc.moveDown(2);
    doc.moveDown(2);
    doc.fontSize(10);
    doc.text('LuxeStay Hotels', { align: 'center' });
    doc.text('123 Heritage Street, New Delhi, India', { align: 'center' });
    doc.text('Phone: +91-9876543210 | Email: support@luxestay.com', { align: 'center' });
    doc.moveDown();
    doc.text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' });

    doc.end();
});

module.exports = router;
