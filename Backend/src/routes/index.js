const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const transactionRoutes = require('./transactions');
const categoryRoutes = require('./categories');
const insightRoutes = require('./insights');
const businessRoutes = require('./business');
const agricultureRoutes = require('./agriculture');
const dairyRoutes = require('./dairy');
const analyticsRoutes = require('./analytics');

// ============================================
// MOUNT ALL ROUTES
// ============================================

// Auth routes (public)
router.use('/auth', authRoutes);

// Personal Finance routes (protected)
router.use('/transactions', transactionRoutes);
router.use('/categories', categoryRoutes);
router.use('/insights', insightRoutes);

// Business Module routes (protected)
router.use('/business', businessRoutes);

// Agriculture Module routes (protected)
router.use('/agriculture', agricultureRoutes);

// Dairy Module routes (protected)
router.use('/dairy', dairyRoutes);

// Analytics routes (protected)
router.use('/analytics', analyticsRoutes);

// Health check (public)
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        modules: ['personal', 'business', 'agriculture', 'dairy']
    });
});

module.exports = router;