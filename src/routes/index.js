// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const priceQuoteRoutes = require('./price-quote.routes');
const receiptsRoutes = require('./receipts.routes');
const rfqsRoutes = require('./rfqs.routes'); 
const purchaseRoutes = require('./purchases.routes'); // ADD THIS


// Check if system routes exist
let systemRoutes;
try {
  systemRoutes = require('./system.routes');
} catch (error) {
  console.log('⚠️  System routes not found, skipping');
}

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/price-quotes', priceQuoteRoutes);
router.use('/receipts', receiptsRoutes);
router.use('/rfqs', rfqsRoutes);
router.use('/purchases', purchaseRoutes);

if (systemRoutes) {
  router.use('/system', systemRoutes);
}

// Health check endpoint for API
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;