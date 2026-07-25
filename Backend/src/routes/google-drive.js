const express = require('express');
const { getDb } = require('../db');
const fs = require('fs');
const path = require('path');

// Note: In production, you'll need to install:
// npm install googleapis

// This is a placeholder implementation
// Full Google Drive integration would require OAuth2 setup

const router = express.Router();

// ============================================
// GOOGLE DRIVE BACKUP
// ============================================

// Backup database to Google Drive
router.post('/backup', async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { backup_name } = req.body;
        
        // Check if user has Google Drive token
        const userStmt = db.prepare('SELECT google_drive_token FROM users WHERE id = ?');
        const user = userStmt.get(userId);
        
        if (!user || !user.google_drive_token) {
            return res.status(400).json({ 
                error: 'Google Drive not connected. Please connect your Google account first.',
                needs_auth: true
            });
        }
        
        // Get database path
        const dbPath = process.env.DB_PATH || './data/pesamind.db';
        
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ error: 'Database file not found' });
        }
        
        const fileName = backup_name || `pesamind_backup_${new Date().toISOString().split('T')[0]}.db`;
        const fileSize = fs.statSync(dbPath).size;
        
        // Placeholder for actual Google Drive upload
        // In production, use googleapis library:
        // const drive = google.drive({ version: 'v3', auth: oauth2Client });
        // const response = await drive.files.create({
        //     requestBody: {
        //         name: fileName,
        //         parents: ['root'],
        //     },
        //     media: {
        //         mimeType: 'application/x-sqlite3',
        //         body: fs.createReadStream(dbPath),
        //     },
        // });
        
        // For now, simulate successful backup
        const fileId = `simulated_${Date.now()}`;
        
        // Save backup record
        const stmt = db.prepare(`
            INSERT INTO google_drive_backups (user_id, backup_name, file_id, file_size, backup_type)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        stmt.run(userId, fileName, fileId, fileSize, 'manual');
        
        res.json({
            success: true,
            message: 'Backup initiated successfully',
            file_id: fileId,
            file_name: fileName,
            file_size: fileSize
        });
    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Get backup history
router.get('/backups', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare(`
            SELECT * FROM google_drive_backups 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `);
        const backups = stmt.all(userId);
        
        res.json({ backups });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch backup history' });
    }
});

// Connect Google Drive
router.post('/connect', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { access_token, refresh_token } = req.body;
        
        if (!access_token) {
            return res.status(400).json({ error: 'Access token is required' });
        }
        
        // Store tokens (in production, store refresh token securely)
        const stmt = db.prepare(`
            UPDATE users SET google_drive_token = ? WHERE id = ?
        `);
        
        // Store both tokens as JSON
        const tokenData = JSON.stringify({ access_token, refresh_token });
        stmt.run(tokenData, userId);
        
        res.json({ success: true, message: 'Google Drive connected successfully' });
    } catch (error) {
        console.error('Connect error:', error);
        res.status(500).json({ error: 'Failed to connect Google Drive' });
    }
});

// Disconnect Google Drive
router.post('/disconnect', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare('UPDATE users SET google_drive_token = NULL WHERE id = ?');
        stmt.run(userId);
        
        res.json({ success: true, message: 'Google Drive disconnected' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to disconnect Google Drive' });
    }
});

module.exports = router;