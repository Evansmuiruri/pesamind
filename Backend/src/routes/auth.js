const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { generateToken } = require('../middleware/auth');
const { bindDeviceToUser } = require('../utils/activation');

const router = express.Router();

// ============================================
// REGISTER
// ============================================

router.post('/register', async (req, res) => {
    const { name, email, password, activation_key, device_id, device_name, device_type } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const db = getDb();
        
        // Check if user exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const stmt = db.prepare(`
            INSERT INTO users (name, email, password_hash) 
            VALUES (?, ?, ?)
        `);
        const result = stmt.run(name, email, passwordHash);
        const userId = result.lastInsertRowid;

        // Handle activation key if provided
        let plan = null;
        if (activation_key) {
            const { useActivationKey } = require('../utils/activation');
            const activationResult = useActivationKey(activation_key, userId, device_id);
            
            if (!activationResult.success) {
                // Still create user but with free plan
                const freePlan = db.prepare('SELECT id FROM subscription_plans WHERE code = ?').get('free');
                if (freePlan) {
                    db.prepare(`
                        INSERT INTO user_subscriptions (user_id, plan_id, activation_key, status, start_date)
                        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
                    `).run(userId, freePlan.id, 'FREE_' + Date.now());
                }
                // Log the failed activation attempt
                db.prepare(`
                    INSERT INTO audit_logs (user_id, action, module, details, status)
                    VALUES (?, ?, ?, ?, ?)
                `).run(userId, 'register_activation_failed', 'subscription', 
                    JSON.stringify({ key: activation_key, error: activationResult.error }), 'failure');
            } else {
                plan = activationResult.plan;
            }
        } else {
            // Assign free plan
            const freePlan = db.prepare('SELECT id FROM subscription_plans WHERE code = ?').get('free');
            if (freePlan) {
                db.prepare(`
                    INSERT INTO user_subscriptions (user_id, plan_id, activation_key, status, start_date)
                    VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
                `).run(userId, freePlan.id, 'FREE_' + Date.now());
            }
        }

        // Register device if provided
        if (device_id) {
            bindDeviceToUser(userId, device_id, device_name, device_type);
        }

        // Log registration
        db.prepare(`
            INSERT INTO audit_logs (user_id, action, module, details, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(userId, 'register', 'auth', 
            JSON.stringify({ email, has_activation: !!activation_key }), 'success');

        // Generate token
        const user = { id: userId, email, name };
        const token = generateToken(user);

        res.status(201).json({
            message: 'User registered successfully',
            user: { id: user.id, name: user.name, email: user.email },
            token,
            plan: plan || { name: 'Free', features: ['personal_finance'] }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================
// LOGIN (with security checks)
// ============================================

router.post('/login', async (req, res) => {
    const { email, password, device_id, device_name, device_type } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const db = getDb();
        
        // Get user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            // Log failed attempt
            db.prepare(`
                INSERT INTO audit_logs (user_id, action, module, details, status)
                VALUES (?, ?, ?, ?, ?)
            `).run(null, 'login_failed', 'auth', 
                JSON.stringify({ email, reason: 'user_not_found' }), 'failure');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            // Log failed attempt
            db.prepare(`
                INSERT INTO audit_logs (user_id, action, module, details, status)
                VALUES (?, ?, ?, ?, ?)
            `).run(user.id, 'login_failed', 'auth', 
                JSON.stringify({ email, reason: 'invalid_password' }), 'failure');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if user has active subscription
        const subStmt = db.prepare(`
            SELECT us.*, sp.name as plan_name, sp.features
            FROM user_subscriptions us
            JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.user_id = ? AND us.status = 'active'
            ORDER BY us.start_date DESC
            LIMIT 1
        `);
        let subscription = subStmt.get(user.id);

        // If no subscription, assign free plan
        if (!subscription) {
            const freePlan = db.prepare('SELECT id FROM subscription_plans WHERE code = ?').get('free');
            if (freePlan) {
                db.prepare(`
                    INSERT INTO user_subscriptions (user_id, plan_id, activation_key, status, start_date)
                    VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
                `).run(user.id, freePlan.id, 'FREE_' + Date.now());
                
                subscription = subStmt.get(user.id);
            }
        }

        // Check subscription expiry
        if (subscription && subscription.end_date && new Date(subscription.end_date) < new Date()) {
            db.prepare('UPDATE user_subscriptions SET status = ? WHERE id = ?')
                .run('expired', subscription.id);
            return res.status(403).json({ 
                error: 'Subscription expired. Please renew.',
                expired: true
            });
        }

        // Register device if provided
        if (device_id) {
            bindDeviceToUser(user.id, device_id, device_name, device_type);
        }

        // Log successful login
        db.prepare(`
            INSERT INTO audit_logs (user_id, action, module, details, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(user.id, 'login', 'auth', 
            JSON.stringify({ email, device_id }), 'success');

        // Generate token
        const token = generateToken(user);

        // Check if user has pending activation
        const pendingKey = db.prepare(`
            SELECT COUNT(*) as count FROM activation_keys 
            WHERE assigned_to = ? AND status = 'used'
        `).get(user.id);

        res.json({
            message: 'Login successful',
            user: { id: user.id, name: user.name, email: user.email },
            token,
            subscription: {
                plan: subscription?.plan_name || 'Free',
                features: subscription ? JSON.parse(subscription.features || '[]') : ['personal_finance'],
                expires_at: subscription?.end_date || null,
                is_active: subscription?.status === 'active'
            },
            has_activation: pendingKey?.count > 0
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================
// VERIFY ACTIVATION STATUS
// ============================================

router.get('/verify-activation', (req, res) => {
    try {
        // This is a protected route, user is already authenticated
        const userId = req.user.id;
        const db = getDb();
        
        const stmt = db.prepare(`
            SELECT us.*, sp.name as plan_name, sp.features
            FROM user_subscriptions us
            JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.user_id = ? AND us.status = 'active'
            ORDER BY us.start_date DESC
            LIMIT 1
        `);
        const subscription = stmt.get(userId);
        
        if (!subscription) {
            return res.json({ 
                activated: false, 
                plan: 'Free',
                features: ['personal_finance']
            });
        }
        
        res.json({
            activated: true,
            plan: subscription.plan_name,
            features: JSON.parse(subscription.features || '[]'),
            expires_at: subscription.end_date
        });
    } catch (error) {
        console.error('Verify activation error:', error);
        res.status(500).json({ error: 'Failed to verify activation' });
    }
});

module.exports = router;