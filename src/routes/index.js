// src/routes/index.js (محدث)
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const priceQuoteRoutes = require('./price-quote.routes');
const receiptsRoutes = require('./receipts.routes');
const cuttingRoutes = require('./cutting.routes');
const secretariatRoutes = require('./secretariat.routes');
const secretariatUserRoutes = require('./secretariat-user.routes');
const rfqRoutes = require('./rfqs.routes');
const PurchaseOrderRoutes = require('./purchases.routes');
const materialsRoutes = require('./materials.routes');
const supplierRoutes = require('./suppliers.routes');
const itemsRoutes = require('./Items.routes');





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
router.use('/cutting', cuttingRoutes);
router.use('/secretariat', secretariatRoutes);
router.use('/user-forms', secretariatUserRoutes);
router.use('/rfqs', rfqRoutes);
router.use('/purchases', PurchaseOrderRoutes);
router.use('/materials', materialsRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/items', itemsRoutes);



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