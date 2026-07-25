require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import modules
const { initializeDatabase } = require('./src/db');
const authRoutes = require('./src/routes/auth');
const transactionRoutes = require('./src/routes/transactions');
const categoryRoutes = require('./src/routes/categories');
const insightRoutes = require('./src/routes/insights');
const businessRoutes = require('./src/routes/business');
const agricultureRoutes = require('./src/routes/agriculture');
const dairyRoutes = require('./src/routes/dairy');
const analyticsRoutes = require('./src/routes/analytics');
const googleDriveRoutes = require('./src/routes/google-drive');
const reportRoutes = require('./src/routes/reports');
const subscriptionRoutes = require('./src/routes/subscription');
const { authenticateToken } = require('./src/middleware/auth');
const { rateLimiter, verifyDevice, requireFeature } = require('./src/middleware/security');
const { sanitizeInput } = require('./src/middleware/sanitize');

// ============================================
// FAIL-FAST: reject weak/default JWT secrets
// ============================================
const WEAK_JWT_SECRETS = [
  '',
  'your-super-secret-jwt-key-change-this-in-production',
  'secret',
  'changeme',
];
const jwtSecret = process.env.JWT_SECRET || '';
if (WEAK_JWT_SECRETS.includes(jwtSecret) || jwtSecret.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is missing, default, or too short (needs 32+ chars). Refusing to start in production.');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET is weak/default. This is only acceptable in development — set a strong, unique JWT_SECRET before deploying.');
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000'];

// Security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? corsOrigins 
    : '*',
  credentials: true
}));

// Middleware
app.use(express.json({ limit: '10mb' }));

// Strip script/HTML tags from all incoming input
app.use(sanitizeInput);

// Apply rate limiter to all requests
app.use(rateLimiter(100, 60000)); // 100 requests per minute

// Ensure database directory exists
const dbDir = path.dirname(process.env.DB_PATH || './data/pesamind.db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure reports directory exists
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Initialize database
const db = initializeDatabase();
app.set('db', db);

// ============================================
// PUBLIC ROUTES (Rate limited)
// ============================================
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    modules: ['personal', 'business', 'agriculture', 'dairy'],
    features: [
      'expenditure_tracking', 
      'output_tracking', 
      'labour_tracking', 
      'google_drive', 
      'pdf_reports',
      'subscriptions',
      'activation_keys',
      'device_management',
      'team_sharing',
      'audit_logs'
    ]
  });
});

// ============================================
// PROTECTED ROUTES (Authentication + Security)
// ============================================

// Device verification middleware (applied to all protected routes)
app.use('/api/*', (req, res, next) => {
  // Skip for auth routes
  if (req.path.startsWith('/api/auth')) return next();
  // Apply device verification
  verifyDevice(req, res, next);
});

// Core features (Free and above)
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/categories', authenticateToken, categoryRoutes);

// Premium features (Require specific subscription)
app.use('/api/insights', authenticateToken, requireFeature('ai_insights'), insightRoutes);
app.use('/api/business', authenticateToken, requireFeature('business_finance'), businessRoutes);
app.use('/api/agriculture', authenticateToken, requireFeature('agriculture'), agricultureRoutes);
app.use('/api/dairy', authenticateToken, requireFeature('dairy'), dairyRoutes);
app.use('/api/analytics', authenticateToken, requireFeature('advanced_reports'), analyticsRoutes);
app.use('/api/drive', authenticateToken, requireFeature('google_drive_backup'), googleDriveRoutes);
app.use('/api/reports', authenticateToken, requireFeature('advanced_reports'), reportRoutes);

// Subscription & Enterprise features
app.use('/api/subscription', authenticateToken, subscriptionRoutes);

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Pesa Mind backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Modules: Personal, Business, Agriculture, Dairy`);
  console.log(`🔒 Security: Helmet headers, Input sanitization, Rate limiting, Device verification, Feature access control`);
  console.log(`📁 Reports directory: ${reportsDir}`);
  console.log(`🔒 CORS origins: ${process.env.NODE_ENV === 'production' ? corsOrigins.join(', ') : '*'}`);
});