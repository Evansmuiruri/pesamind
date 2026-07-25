const express = require('express');
const { getDb } = require('../db');
const { 
    validateActivationKey, 
    useActivationKey,
    generateActivationKey,
    generateBulkActivationKeys,
    bindDeviceToUser,
    shareEntity,
    getSharedEntities
} = require('../utils/activation');

const router = express.Router();

// ============================================
// SUBSCRIPTION PLANS
// ============================================

// Get all available plans
router.get('/plans', (req, res) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly ASC');
        const plans = stmt.all();
        res.json({ plans });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

// Get user's current subscription
router.get('/current', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare(`
            SELECT us.*, sp.name as plan_name, sp.features, sp.max_users, sp.max_businesses, sp.max_farms, sp.max_animals
            FROM user_subscriptions us
            JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.user_id = ? AND us.status = 'active'
            ORDER BY us.start_date DESC
            LIMIT 1
        `);
        const subscription = stmt.get(userId);
        
        if (!subscription) {
            // Check if user has a free plan
            const freeStmt = db.prepare('SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1');
            const freePlan = freeStmt.get('free');
            
            if (freePlan) {
                // Assign free plan
                const insertStmt = db.prepare(`
                    INSERT INTO user_subscriptions (user_id, plan_id, activation_key, status, start_date)
                    VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
                `);
                insertStmt.run(userId, freePlan.id, 'FREE_' + Date.now());
                
                const newSub = db.prepare(`
                    SELECT us.*, sp.name as plan_name, sp.features, sp.max_users, sp.max_businesses, sp.max_farms, sp.max_animals
                    FROM user_subscriptions us
                    JOIN subscription_plans sp ON us.plan_id = sp.id
                    WHERE us.id = last_insert_rowid()
                `).get();
                
                return res.json({ subscription: newSub });
            }
            
            return res.json({ subscription: null });
        }
        
        res.json({ subscription });
    } catch (error) {
        console.error('Current subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});

// ============================================
// ACTIVATION KEYS
// ============================================

// Activate a key
router.post('/activate', (req, res) => {
    try {
        const { key_code, device_id, device_name, device_type } = req.body;
        const userId = req.user.id;
        
        if (!key_code) {
            return res.status(400).json({ error: 'Activation key is required' });
        }
        
        const result = useActivationKey(key_code, userId, device_id);
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        // Bind device if provided
        if (device_id) {
            bindDeviceToUser(userId, device_id, device_name, device_type);
        }
        
        res.json({
            success: true,
            message: result.message,
            plan: result.plan
        });
    } catch (error) {
        console.error('Activation error:', error);
        res.status(500).json({ error: 'Failed to activate key' });
    }
});

// Validate a key (without using it)
router.post('/validate', (req, res) => {
    try {
        const { key_code } = req.body;
        
        if (!key_code) {
            return res.status(400).json({ error: 'Activation key is required' });
        }
        
        const result = validateActivationKey(key_code);
        
        if (!result.valid) {
            return res.status(400).json({ 
                valid: false, 
                error: result.error 
            });
        }
        
        res.json({
            valid: true,
            plan: result.plan,
            key: {
                created_at: result.key.created_at,
                expires_at: result.key.expires_at,
                max_activations: result.key.max_activations,
                activation_count: result.key.activation_count
            }
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ error: 'Failed to validate key' });
    }
});

// Generate activation keys (Admin only)
router.post('/generate', async (req, res) => {
    try {
        const { plan_id, count = 1, expires_in_days = 365 } = req.body;
        const userId = req.user.id;
        
        // Check if user is admin
        const db = getDb();
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
        
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }
        
        const result = generateBulkActivationKeys(plan_id, count, userId, expires_in_days);
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({
            success: true,
            keys: result.keys,
            count: result.keys.length,
            message: `Generated ${result.keys.length} activation keys`
        });
    } catch (error) {
        console.error('Generate keys error:', error);
        res.status(500).json({ error: 'Failed to generate keys' });
    }
});

// Get user's activation keys (Admin only)
router.get('/keys', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        // Check if user is admin
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
        
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const stmt = db.prepare(`
            SELECT ak.*, sp.name as plan_name, u.name as assigned_to_name
            FROM activation_keys ak
            JOIN subscription_plans sp ON ak.plan_id = sp.id
            LEFT JOIN users u ON ak.assigned_to = u.id
            ORDER BY ak.created_at DESC
            LIMIT 100
        `);
        const keys = stmt.all();
        
        res.json({ keys });
    } catch (error) {
        console.error('Get keys error:', error);
        res.status(500).json({ error: 'Failed to fetch keys' });
    }
});

// Revoke an activation key (Admin only)
router.delete('/keys/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        
        // Check if user is admin
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
        
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const stmt = db.prepare('UPDATE activation_keys SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run('revoked', id);
        
        res.json({ success: true, message: 'Activation key revoked' });
    } catch (error) {
        console.error('Revoke key error:', error);
        res.status(500).json({ error: 'Failed to revoke key' });
    }
});

// ============================================
// DEVICE MANAGEMENT
// ============================================

// Register/update device
router.post('/device/register', (req, res) => {
    try {
        const { device_id, device_name, device_type, device_os, browser } = req.body;
        const userId = req.user.id;
        
        if (!device_id) {
            return res.status(400).json({ error: 'Device ID is required' });
        }
        
        const result = bindDeviceToUser(userId, device_id, device_name, device_type);
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        // Log device registration
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO audit_logs (user_id, action, module, details, status)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            userId,
            'device_register',
            'security',
            JSON.stringify({ device_id, device_name, device_type }),
            'success'
        );
        
        res.json({ success: true, message: 'Device registered successfully' });
    } catch (error) {
        console.error('Device registration error:', error);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

// Get user devices
router.get('/devices', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare(`
            SELECT * FROM user_devices 
            WHERE user_id = ? 
            ORDER BY last_active DESC
        `);
        const devices = stmt.all(userId);
        
        res.json({ devices });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// Remove device
router.delete('/devices/:device_id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { device_id } = req.params;
        
        const stmt = db.prepare('UPDATE user_devices SET is_active = 0 WHERE device_id = ? AND user_id = ?');
        stmt.run(device_id, userId);
        
        res.json({ success: true, message: 'Device removed' });
    } catch (error) {
        console.error('Remove device error:', error);
        res.status(500).json({ error: 'Failed to remove device' });
    }
});

// ============================================
// SHARING
// ============================================

// Share entity with another user
router.post('/share', (req, res) => {
    try {
        const { shared_with_email, module, entity_id, permission } = req.body;
        const ownerId = req.user.id;
        
        if (!shared_with_email || !module || !entity_id) {
            return res.status(400).json({ error: 'Email, module, and entity ID are required' });
        }
        
        // Find user by email
        const db = getDb();
        const userStmt = db.prepare('SELECT id FROM users WHERE email = ?');
        const sharedWith = userStmt.get(shared_with_email);
        
        if (!sharedWith) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (sharedWith.id === ownerId) {
            return res.status(400).json({ error: 'Cannot share with yourself' });
        }
        
        const result = shareEntity(ownerId, sharedWith.id, module, entity_id, permission || 'view');
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        res.json({ 
            success: true, 
            message: `Shared ${module} with ${shared_with_email}` 
        });
    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({ error: 'Failed to share' });
    }
});

// Get shared entities
router.get('/shared', (req, res) => {
    try {
        const userId = req.user.id;
        const result = getSharedEntities(userId);
        
        res.json(result);
    } catch (error) {
        console.error('Get shared error:', error);
        res.status(500).json({ error: 'Failed to get shared entities' });
    }
});

// Remove sharing
router.delete('/share/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        
        const stmt = db.prepare(`
            UPDATE shared_access SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `);
        stmt.run(id, userId);
        
        res.json({ success: true, message: 'Sharing removed' });
    } catch (error) {
        console.error('Remove sharing error:', error);
        res.status(500).json({ error: 'Failed to remove sharing' });
    }
});

// ============================================
// AUDIT LOGS
// ============================================

// Get audit logs for user
router.get('/audit', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { limit = 50, module, action } = req.query;
        
        let query = 'SELECT * FROM audit_logs WHERE user_id = ?';
        const params = [userId];
        
        if (module) {
            query += ' AND module = ?';
            params.push(module);
        }
        if (action) {
            query += ' AND action = ?';
            params.push(action);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit) || 50);
        
        const stmt = db.prepare(query);
        const logs = stmt.all(...params);
        
        res.json({ logs });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

module.exports = router;