const express = require('express');
const router = express.Router();
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Coupon = require('../models/Coupon');

// 🔐 Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'myprojectscse@gmail.com',
        pass: 'usqvcgqwxujystax'
    }
});

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
        coupon: null,
        messages: {
            error: req.flash('error'),
            success: req.flash('success')
        }
    });

});

// Validate coupon
router.get('/validate-coupon', isLoggedIn, async (req, res) => {
    const { code, roomId, checkIn, checkOut } = req.query;
    if (!code || !roomId || !checkIn || !checkOut) return res.json({ valid: false });

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true });
    const room = await Room.findById(roomId);

    if (!coupon || new Date(coupon.expiresAt) < new Date()) return res.json({ valid: false });

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

    // ⛔ Check room availability before booking
    if (room.available <= 0) {
        req.flash('error', 'Room is sold out.');
        return res.redirect(`/bookings/checkout?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
    }

    // 🛑 Double Booking Check
    const overlappingBooking = await Booking.findOne({
        room: roomId,
        $or: [
            {
                checkIn: { $lt: new Date(checkOut) },
                checkOut: { $gt: new Date(checkIn) }
            }
        ]
    });

    if (overlappingBooking) {
        req.flash('error', 'Room is already booked for the selected dates.');
        return res.redirect(`/bookings/checkout?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
    }

    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    let totalPrice = nights * room.price;

    let appliedCoupon = null;
    if (coupon?.trim()) {
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
        status: paymentMethod === 'At Hotel' ? 'PENDING' : 'COMPLETED',
        paymentStatus: paymentMethod === 'At Hotel' ? 'PENDING' : 'PAID'
    });

    await booking.save();

    // 🔽 Reduce room availability
    room.available -= 1;
    await room.save();

    // 📧 Send booking confirmation email with PDF invoice
    const pdfBuffer = await generateInvoicePDFBuffer(booking, req.session.user, room);

    await transporter.sendMail({
        to: req.session.user.email,
        subject: 'LuxeStay Booking Confirmation',
        text: `Dear ${req.session.user.firstName}, your booking is confirmed!
    Thank you for choosing to stay with us. We're delighted to host you and are committed to making your visit comfortable and memorable.
    Your stay is scheduled from ${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()}.
    Booking details:
    - Booking reference: ${booking._id}
    
    If you have any questions or special requests before your arrival, please don’t hesitate to reach out.
    We look forward to welcoming you and wish you a wonderful stay!
    
    Warm regards,  
    -LuxeStay Hotels`,
        attachments: [{
            filename: `Invoice-${booking._id}.pdf`,
            content: pdfBuffer
        }]
    });

    res.redirect('/bookings/my');
});

// My bookings
router.get('/my', isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.user._id }).populate('room');
    const today = new Date();

    const updatedBookings = bookings.map(b => {
        const checkIn = new Date(b.checkIn);
        const checkOut = new Date(b.checkOut);
        let actualStatus;
        if (today < checkIn) actualStatus = 'UPCOMING';
        else if (today <= checkOut) actualStatus = 'ONGOING';
        else actualStatus = 'COMPLETED';

        return {
            ...b.toObject(),
            dynamicStatus: actualStatus
        };
    });

    res.render('bookings/myBookings', { bookings: updatedBookings, user: req.session.user });
});

// Cancel booking
router.get('/cancel/:id', isLoggedIn, async (req, res) => {
    const booking = await Booking.findOneAndDelete({
        _id: req.params.id,
        user: req.session.user._id
    }).populate('room');

    if (booking) {
        // 🔼 Increase availability back
        const room = await Room.findById(booking.room._id);
        if (room) {
            room.available += 1;
            await room.save();
        }
        await transporter.sendMail({
            to: req.session.user.email,
            subject: 'Booking Cancellation - LuxeStay',
            text: `Dear ${req.session.user.firstName},
Your booking for room from ${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()} has been canceled.

Hope to welcome you again!

- LuxeStay Hotels`
        });
    }

    res.redirect('/bookings/my');
});

// Download invoice as PDF
router.get('/:id/invoice', isLoggedIn, async (req, res) => {
    const booking = await Booking.findOne({
        _id: req.params.id,
        user: req.session.user._id
    }).populate('room');

    if (!booking) return res.status(404).send('Booking not found.');

    const doc = new PDFDocument({ margin: 50 });
    const filename = `Invoice-${booking._id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    generateInvoiceContent(doc, booking, req.session.user);
    doc.end();
});

// Helper: Generate invoice PDF buffer (for email)
async function generateInvoicePDFBuffer(booking, user, room) {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    return new Promise(resolve => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        generateInvoiceContent(doc, { ...booking.toObject(), room }, user);
        doc.end();
    });
}

// Helper: Invoice PDF content
function generateInvoiceContent(doc, booking, guest) {
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    try {
        doc.image(logoPath, 50, 40, { width: 100 });
    } catch (err) { }

    doc.fontSize(20).text('LuxeStay Hotels', 160, 50);
    doc.fontSize(12).text('123 Heritage Street, New Delhi, India', 160);
    doc.text('Phone: +91-9876543210 | Email: support@luxestay.com', 160);
    doc.moveDown();

    doc.fontSize(16).text('Booking Invoice', { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text(`Invoice ID: ${booking._id}`);
    doc.text(`Date Issued: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    doc.text(`Guest Name: ${guest.firstName} ${guest.lastName}`);
    doc.text(`Email: ${guest.email}`);
    doc.moveDown();

    doc.text(`Room Booked: ${booking.room.name}`);
    doc.text(`Stay Duration: ${new Date(booking.checkIn).toDateString()} to ${new Date(booking.checkOut).toDateString()}`);
    doc.text(`Guests: ${booking.guests}`);
    doc.text(`Payment Method: ${booking.paymentMethod}`);
    doc.text(`Booking Status: ${booking.status}`);
    doc.text(`Payment Status: ${booking.paymentStatus}`);
    doc.moveDown();

    const subtotal = booking.totalPrice / 1.18;
    const gst = booking.totalPrice - subtotal;

    doc.font('Helvetica-Bold').text('Charges Breakdown');
    doc.font('Helvetica');
    doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`);
    doc.text(`GST (18%): ₹${gst.toFixed(2)}`);
    doc.font('Helvetica-Bold').text(`Total: ₹${booking.totalPrice.toFixed(2)}`);
    doc.moveDown(2);

    doc.fontSize(10).text('Thank you for booking with LuxeStay Hotels.', { align: 'center' });
    doc.text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });
}

module.exports = router;
