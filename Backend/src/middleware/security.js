const { getDb } = require('../db');

// ============================================
// RATE LIMITING (Prevent brute force)
// ============================================

const rateLimitStore = {};

function rateLimiter(limit = 100, windowMs = 60000) {
    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!rateLimitStore[key]) {
            rateLimitStore[key] = [];
        }
        
        // Clean old entries
        rateLimitStore[key] = rateLimitStore[key].filter(time => now - time < windowMs);
        
        if (rateLimitStore[key].length >= limit) {
            return res.status(429).json({ 
                error: 'Too many requests. Please try again later.' 
            });
        }
        
        rateLimitStore[key].push(now);
        next();
    };
}

// ============================================
// DEVICE VERIFICATION (Prevent unauthorized access)
// ============================================

function verifyDevice(req, res, next) {
    const userId = req.user?.id;
    const deviceId = req.headers['x-device-id'];
    
    if (!userId || !deviceId) {
        return next(); // Skip if no device info
    }
    
    try {
        const db = getDb();
        const stmt = db.prepare(`
            SELECT * FROM user_devices 
            WHERE device_id = ? AND user_id = ? AND is_active = 1
        `);
        const device = stmt.get(deviceId, userId);
        
        if (!device) {
            return res.status(403).json({ 
                error: 'Device not recognized. Please register your device.' 
            });
        }
        
        // Update last active
        db.prepare('UPDATE user_devices SET last_active = CURRENT_TIMESTAMP WHERE id = ?')
            .run(device.id);
        
        next();
    } catch (error) {
        console.error('Device verification error:', error);
        next();
    }
}

// ============================================
// FEATURE ACCESS CONTROL
// ============================================

function requireFeature(feature) {
    return (req, res, next) => {
        // Feature/plan gating is currently disabled. The plan-check logic
        // below is left in place in case it's needed again later — set
        // FEATURE_GATING_ENABLED=true in .env to turn it back on.
        if (process.env.FEATURE_GATING_ENABLED !== 'true') {
            return next();
        }

        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT sp.features 
                FROM user_subscriptions us
                JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE us.user_id = ? AND us.status = 'active'
                ORDER BY us.start_date DESC
                LIMIT 1
            `);
            const sub = stmt.get(userId);
            
            if (!sub || !sub.features) {
                return res.status(403).json({ 
                    error: 'Feature not available with your current plan',
                    required_feature: feature
                });
            }
            
            const features = JSON.parse(sub.features);
            
            if (!features.includes(feature)) {
                return res.status(403).json({ 
                    error: `"${feature}" is not available with your current plan. Please upgrade.`,
                    required_feature: feature
                });
            }
            
            next();
        } catch (error) {
            console.error('Feature check error:', error);
            res.status(500).json({ error: 'Failed to verify feature access' });
        }
    };
}

// ============================================
// ENTITY OWNERSHIP VERIFICATION
// ============================================

function verifyOwnership(tableName, idParam = 'id') {
    return (req, res, next) => {
        const userId = req.user?.id;
        const entityId = req.params[idParam];
        
        if (!userId || !entityId) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT user_id FROM ${tableName} WHERE id = ?
            `);
            const entity = stmt.get(entityId);
            
            if (!entity) {
                return res.status(404).json({ error: 'Entity not found' });
            }
            
            if (entity.user_id !== userId) {
                // Check if user has shared access
                const shareStmt = db.prepare(`
                    SELECT * FROM shared_access 
                    WHERE shared_with_id = ? 
                    AND entity_id = ? 
                    AND module = ? 
                    AND status = 'active'
                `);
                const share = shareStmt.get(userId, entityId, tableName);
                
                if (!share) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                
                // Check permission level
                if (req.method === 'PUT' || req.method === 'DELETE') {
                    if (share.permission !== 'edit' && share.permission !== 'admin') {
                        return res.status(403).json({ error: 'Edit permission required' });
                    }
                }
            }
            
            req.entity = entity;
            next();
        } catch (error) {
            console.error('Ownership verification error:', error);
            res.status(500).json({ error: 'Failed to verify ownership' });
        }
    };
}

module.exports = {
    rateLimiter,
    verifyDevice,
    requireFeature,
    verifyOwnership
};