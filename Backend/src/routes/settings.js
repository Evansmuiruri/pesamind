const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { getDb } = require('../db');

// ============================================
// GET PROFILE + SETTINGS
// ============================================
router.get('/profile', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const user = db.prepare('SELECT id, name, email, phone, location, is_admin, created_at FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        let preferences = {};
        try {
            const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId);
            if (row?.preferences) preferences = JSON.parse(row.preferences);
        } catch (_) { /* preferences column may not exist yet, or is empty */ }

        res.json({ user, preferences });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ============================================
// UPDATE PROFILE (name, phone, location)
// ============================================
router.put('/profile', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { name, phone, location } = req.body;

        db.prepare(`
            UPDATE users
            SET name = COALESCE(?, name),
                phone = COALESCE(?, phone),
                location = COALESCE(?, location),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, phone, location, userId);

        const user = db.prepare('SELECT id, name, email, phone, location FROM users WHERE id = ?').get(userId);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============================================
// UPDATE PREFERENCES (currency display, notifications, theme)
// ============================================
router.put('/preferences', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const existing = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId);
        let current = {};
        try { current = existing?.preferences ? JSON.parse(existing.preferences) : {}; } catch (_) {}

        const updated = { ...current, ...req.body };
        db.prepare('UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(updated), userId);

        res.json({ success: true, preferences: updated });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// ============================================
// CHANGE PASSWORD
// ============================================
router.put('/password', async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }
        if (new_password.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(new_password, 12);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, userId);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ============================================
// LIST ACTIVE DEVICES (security overview)
// ============================================
router.get('/devices', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const devices = db.prepare(`
            SELECT id, device_id, device_name, last_active, is_active, created_at
            FROM user_devices WHERE user_id = ? ORDER BY last_active DESC
        `).all(userId);
        res.json({ devices });
    } catch (error) {
        // Table may not exist in older DBs - fail gracefully
        res.json({ devices: [] });
    }
});

router.delete('/devices/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        db.prepare('UPDATE user_devices SET is_active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to revoke device' });
    }
});

// ============================================
// DELETE ACCOUNT (requires password confirmation)
// ============================================
router.delete('/account', async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { password } = req.body;

        if (!password) return res.status(400).json({ error: 'Password confirmation is required' });

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Incorrect password' });

        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router;
