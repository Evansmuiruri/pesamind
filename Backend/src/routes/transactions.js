const express = require('express');
const { getDb } = require('../db');
const { parseSMS } = require('../parsers/mpesa');
const { getCategoryForKeywordWithUserOverride } = require('../utils/categorizer');

const router = express.Router();

// Get all transactions for user
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    
    const stmt = db.prepare(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY transaction_date DESC
    `);
    const transactions = stmt.all(userId);
    
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transactions with date filter
router.get('/filter', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { startDate, endDate, category, type } = req.query;
    
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];
    
    if (startDate) {
      query += ' AND transaction_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND transaction_date <= ?';
      params.push(endDate);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY transaction_date DESC';
    
    const stmt = db.prepare(query);
    const transactions = stmt.all(...params);
    
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch filtered transactions' });
  }
});

// Create transaction from SMS
router.post('/parse', (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'SMS message is required' });
    }
    
    const result = parseSMS(message);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    // Auto-categorize
    const category = getCategoryForKeywordWithUserOverride(
      req.user.id, 
      result.counterparty
    );
    
    // Save transaction
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO transactions 
      (user_id, type, amount, counterparty, category, raw_message, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      req.user.id,
      result.type,
      result.amount,
      result.counterparty,
      category,
      result.raw_message,
      result.transaction_date
    );
    
    res.status(201).json({
      success: true,
      transaction: {
        id: info.lastInsertRowid,
        ...result,
        category
      }
    });
    
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: 'Failed to parse SMS' });
  }
});

// Bulk parse SMS messages
router.post('/parse-bulk', (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    const db = getDb();
    const insertStmt = db.prepare(`
      INSERT INTO transactions 
      (user_id, type, amount, counterparty, category, raw_message, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const results = [];
    const errors = [];
    
    const insertMany = db.transaction((parsedMessages) => {
      for (const parsed of parsedMessages) {
        const category = getCategoryForKeywordWithUserOverride(
          req.user.id, 
          parsed.counterparty
        );
        
        insertStmt.run(
          req.user.id,
          parsed.type,
          parsed.amount,
          parsed.counterparty,
          category,
          parsed.raw_message,
          parsed.transaction_date
        );
      }
    });
    
    const parsedMessages = [];
    messages.forEach((msg, index) => {
      const result = parseSMS(msg);
      if (result.success) {
        parsedMessages.push(result);
      } else {
        errors.push({ index, message: msg.substring(0, 50) + '...', error: result.error });
      }
    });
    
    if (parsedMessages.length > 0) {
      insertMany(parsedMessages);
    }
    
    res.json({
      success: true,
      total: messages.length,
      parsed: parsedMessages.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Bulk parse error:', error);
    res.status(500).json({ error: 'Failed to bulk parse messages' });
  }
});

// Update transaction category
router.put('/:id/category', (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const userId = req.user.id;
    
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    const db = getDb();
    
    // Verify ownership
    const checkStmt = db.prepare('SELECT user_id FROM transactions WHERE id = ?');
    const tx = checkStmt.get(id);
    
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    if (tx.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update
    const stmt = db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
    stmt.run(category, id);
    
    res.json({ success: true, category });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete transaction
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const db = getDb();
    
    // Verify ownership
    const checkStmt = db.prepare('SELECT user_id FROM transactions WHERE id = ?');
    const tx = checkStmt.get(id);
    
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    if (tx.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    stmt.run(id);
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// Get summary stats
router.get('/summary', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { period = 'month' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    } else if (period === 'quarter') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
    } else {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }
    
    const stmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN type IN ('received', 'deposit') THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type IN ('sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as total_transactions,
        GROUP_CONCAT(DISTINCT type) as types
      FROM transactions 
      WHERE user_id = ? AND transaction_date >= ?
    `);
    
    const result = stmt.get(userId, startDate.toISOString());
    
    // Get category breakdown
    const catStmt = db.prepare(`
      SELECT category, COUNT(*) as count, SUM(amount) as total
      FROM transactions 
      WHERE user_id = ? AND transaction_date >= ? AND type NOT IN ('received', 'deposit')
      GROUP BY category
      ORDER BY total DESC
    `);
    
    const categories = catStmt.all(userId, startDate.toISOString());
    
    res.json({
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      summary: {
        total_income: result.total_income || 0,
        total_expenses: result.total_expenses || 0,
        balance: (result.total_income || 0) - (result.total_expenses || 0),
        total_transactions: result.total_transactions || 0
      },
      categories
    });
    
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

module.exports = router;