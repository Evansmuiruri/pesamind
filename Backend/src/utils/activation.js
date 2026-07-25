const crypto = require('crypto');
const { getDb } = require('../db');

// ============================================
// ACTIVATION KEY GENERATION
// ============================================

function generateActivationKey() {
    // Format: PESA-XXXX-XXXX-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    
    for (let i = 0; i < 4; i++) {
        let segment = '';
        for (let j = 0; j < 4; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        segments.push(segment);
    }
    
    return `PESA-${segments.join('-')}`;
}

function generateSecureActivationKey() {
    // More secure: 32 character hex with prefix
    const random = crypto.randomBytes(16).toString('hex').toUpperCase();
    const checksum = crypto.createHash('sha256')
        .update(random + process.env.JWT_SECRET)
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();
    
    return `PESA-${random.substring(0, 8)}-${random.substring(8, 16)}-${random.substring(16, 24)}-${checksum}`;
}

// ============================================
// KEY VALIDATION
// ============================================

function validateActivationKey(keyCode) {
    const db = getDb();
    
    // Check format
    const keyRegex = /^PESA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyRegex.test(keyCode)) {
        return { valid: false, error: 'Invalid key format' };
    }
    
    // Check in database
    const stmt = db.prepare(`
        SELECT ak.*, sp.name as plan_name, sp.features
        FROM activation_keys ak
        JOIN subscription_plans sp ON ak.plan_id = sp.id
        WHERE ak.key_code = ?
    `);
    const key = stmt.get(keyCode);
    
    if (!key) {
        return { valid: false, error: 'Activation key not found' };
    }
    
    // Check status
    if (key.status === 'used') {
        return { valid: false, error: 'Activation key has already been used' };
    }
    
    if (key.status === 'expired') {
        return { valid: false, error: 'Activation key has expired' };
    }
    
    if (key.status === 'revoked') {
        return { valid: false, error: 'Activation key has been revoked' };
    }
    
    // Check expiry
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
        // Update status to expired
        db.prepare('UPDATE activation_keys SET status = ? WHERE id = ?')
            .run('expired', key.id);
        return { valid: false, error: 'Activation key has expired' };
    }
    
    // Check activation count
    if (key.max_activations && key.activation_count >= key.max_activations) {
        return { valid: false, error: 'Activation key has reached maximum uses' };
    }
    
    return { 
        valid: true, 
        key: key,
        plan: {
            id: key.plan_id,
            name: key.plan_name,
            features: JSON.parse(key.features || '[]')
        }
    };
}

function useActivationKey(keyCode, userId, deviceId = null) {
    const db = getDb();
    
    // Validate key
    const validation = validateActivationKey(keyCode);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }
    
    const keyData = validation.key;
    
    // Start transaction
    const transaction = db.transaction(() => {
        // Update activation key
        const updateStmt = db.prepare(`
            UPDATE activation_keys 
            SET status = 'used', 
                assigned_to = ?, 
                activation_count = activation_count + 1,
                device_id = COALESCE(?, device_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        updateStmt.run(userId, deviceId, keyData.id);
        
        // Create subscription for user
        const subStmt = db.prepare(`
            INSERT INTO user_subscriptions (
                user_id, plan_id, activation_key, status, start_date, end_date
            ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, 
                datetime('now', '+1 year')
            )
        `);
        subStmt.run(userId, keyData.plan_id, keyCode);
        
        // Log the activation
        const logStmt = db.prepare(`
            INSERT INTO audit_logs (user_id, action, module, details, status)
            VALUES (?, ?, ?, ?, ?)
        `);
        logStmt.run(
            userId,
            'activate_key',
            'subscription',
            JSON.stringify({ key_code: keyCode, plan_id: keyData.plan_id }),
            'success'
        );
    });
    
    try {
        transaction();
        return { 
            success: true, 
            message: 'Activation successful!',
            plan: validation.plan
        };
    } catch (error) {
        console.error('Activation error:', error);
        return { success: false, error: 'Failed to activate key' };
    }
}

function generateBulkActivationKeys(planId, count, createdBy, expiresInDays = 365) {
    const db = getDb();
    const keys = [];
    
    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            INSERT INTO activation_keys (
                key_code, plan_id, created_by, expires_at, max_activations
            ) VALUES (?, ?, ?, datetime('now', ?), ?)
        `);
        
        for (let i = 0; i < count; i++) {
            const keyCode = generateSecureActivationKey();
            stmt.run(
                keyCode,
                planId,
                createdBy,
                `+${expiresInDays} days`,
                1
            );
            keys.push(keyCode);
        }
    });
    
    try {
        transaction();
        return { success: true, keys };
    } catch (error) {
        console.error('Bulk generation error:', error);
        return { success: false, error: 'Failed to generate keys' };
    }
}

// ============================================
// DEVICE BINDING (Hardware Locking)
// ============================================

function bindDeviceToUser(userId, deviceId, deviceName, deviceType) {
    const db = getDb();
    
    // Check if device already exists
    const existing = db.prepare('SELECT id FROM user_devices WHERE device_id = ?').get(deviceId);
    
    if (existing) {
        // Update existing device
        const stmt = db.prepare(`
            UPDATE user_devices 
            SET user_id = ?, device_name = COALESCE(?, device_name),
                device_type = COALESCE(?, device_type),
                last_active = CURRENT_TIMESTAMP,
                is_active = 1
            WHERE device_id = ?
        `);
        stmt.run(userId, deviceName, deviceType, deviceId);
    } else {
        // Create new device
        const stmt = db.prepare(`
            INSERT INTO user_devices (user_id, device_id, device_name, device_type, last_active)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(userId, deviceId, deviceName, deviceType);
    }
    
    // Check device limit based on subscription
    const subStmt = db.prepare(`
        SELECT sp.max_users 
        FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
        ORDER BY us.start_date DESC
        LIMIT 1
    `);
    const plan = subStmt.get(userId);
    
    if (plan) {
        const deviceCount = db.prepare('SELECT COUNT(*) as count FROM user_devices WHERE user_id = ? AND is_active = 1')
            .get(userId).count;
        
        if (deviceCount > plan.max_users) {
            return { 
                success: false, 
                error: `Device limit reached. Your plan allows ${plan.max_users} device(s).` 
            };
        }
    }
    
    return { success: true };
}

// ============================================
// SHARED ACCESS MANAGEMENT
// ============================================

function shareEntity(ownerId, sharedWithId, module, entityId, permission) {
    const db = getDb();
    
    // Check if user exists
    const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(sharedWithId);
    if (!userCheck) {
        return { success: false, error: 'User not found' };
    }
    
    // Check if owner has permission to share
    const subCheck = db.prepare(`
        SELECT sp.features 
        FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
        ORDER BY us.start_date DESC
        LIMIT 1
    `);
    const sub = subCheck.get(ownerId);
    
    if (!sub || !sub.features || !JSON.parse(sub.features).includes('team_sharing')) {
        return { success: false, error: 'Your plan does not support sharing' };
    }
    
    // Create or update share
    const stmt = db.prepare(`
        INSERT INTO shared_access (owner_id, shared_with_id, module, entity_id, permission)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, shared_with_id, module, entity_id) 
        DO UPDATE SET permission = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(ownerId, sharedWithId, module, entityId, permission, permission);
    
    // Log
    const logStmt = db.prepare(`
        INSERT INTO audit_logs (user_id, action, module, entity_id, details, status)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    logStmt.run(
        ownerId,
        'share',
        module,
        entityId,
        JSON.stringify({ shared_with: sharedWithId, permission }),
        'success'
    );
    
    return { success: true };
}

function getSharedEntities(userId) {
    const db = getDb();
    
    // Get items shared with user
    const sharedWith = db.prepare(`
        SELECT sa.*, u.name as owner_name, u.email as owner_email
        FROM shared_access sa
        JOIN users u ON sa.owner_id = u.id
        WHERE sa.shared_with_id = ? AND sa.status = 'active'
    `).all(userId);
    
    // Get items user has shared
    const sharedBy = db.prepare(`
        SELECT sa.*, u.name as shared_with_name, u.email as shared_with_email
        FROM shared_access sa
        JOIN users u ON sa.shared_with_id = u.id
        WHERE sa.owner_id = ? AND sa.status = 'active'
    `).all(userId);
    
    return { shared_with: sharedWith, shared_by: sharedBy };
}

module.exports = {
    generateActivationKey,
    generateSecureActivationKey,
    validateActivationKey,
    useActivationKey,
    generateBulkActivationKeys,
    bindDeviceToUser,
    shareEntity,
    getSharedEntities
};