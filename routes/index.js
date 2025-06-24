const express = require('express');
const router = express.Router();

// Landing Page Route
router.get('/', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

module.exports = router;