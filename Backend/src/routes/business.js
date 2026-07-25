const express = require('express');
const { getDb } = require('../db');
const { parseSMS } = require('../parsers/mpesa');
const { getCategoryForKeywordWithUserOverride } = require('../utils/categorizer');

const router = express.Router();

// ============================================
// BUSINESS CRUD
// ============================================

// Get all businesses
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    
    const stmt = db.prepare(`
      SELECT *, 
        (SELECT COUNT(*) FROM business_transactions WHERE business_id = businesses.id) as transaction_count
      FROM businesses 
      WHERE user_id = ? 
      ORDER BY name ASC
    `);
    const businesses = stmt.all(userId);
    
    res.json({ businesses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Create business
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { name, description, type, registration_number, location } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Business name is required' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO businesses (user_id, name, description, type, registration_number, location)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(userId, name, description, type, registration_number, location);
    const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({ success: true, business });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// Update business
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, type, registration_number, location, is_active } = req.body;
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const stmt = db.prepare(`
      UPDATE businesses 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          type = COALESCE(?, type),
          registration_number = COALESCE(?, registration_number),
          location = COALESCE(?, location),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(name, description, type, registration_number, location, is_active, id);
    const updated = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
    
    res.json({ success: true, business: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// Delete business
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { id } = req.params;
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const stmt = db.prepare('DELETE FROM businesses WHERE id = ?');
    stmt.run(id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

// ============================================
// BUSINESS TRANSACTIONS
// ============================================

// Get transactions for a business
router.get('/:businessId/transactions', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { businessId } = req.params;
    const { startDate, endDate, category, type } = req.query;
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    let query = 'SELECT * FROM business_transactions WHERE business_id = ?';
    const params = [businessId];
    
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
    res.status(500).json({ error: 'Failed to fetch business transactions' });
  }
});

// Parse and add business transaction from SMS
router.post('/:businessId/transactions/parse', (req, res) => {
  try {
    const { businessId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const db = getDb();
    
    if (!message) {
      return res.status(400).json({ error: 'SMS message is required' });
    }
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const result = parseSMS(message);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    const category = getCategoryForKeywordWithUserOverride(userId, result.counterparty);
    
    const stmt = db.prepare(`
      INSERT INTO business_transactions 
      (business_id, type, amount, counterparty, category, raw_message, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      businessId,
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
        business_id: businessId,
        ...result,
        category
      }
    });
  } catch (error) {
    console.error('Business parse error:', error);
    res.status(500).json({ error: 'Failed to parse SMS for business' });
  }
});

// Add manual business transaction
router.post('/:businessId/transactions', (req, res) => {
  try {
    const { businessId } = req.params;
    const { type, amount, counterparty, category, description, transaction_date } = req.body;
    const userId = req.user.id;
    const db = getDb();
    
    if (!type || !amount) {
      return res.status(400).json({ error: 'Type and amount are required' });
    }
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const stmt = db.prepare(`
      INSERT INTO business_transactions 
      (business_id, type, amount, counterparty, category, description, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      businessId,
      type,
      amount,
      counterparty || null,
      category || 'Uncategorized',
      description || null,
      transaction_date || new Date().toISOString()
    );
    
    const tx = db.prepare('SELECT * FROM business_transactions WHERE id = ?').get(info.lastInsertRowid);
    
    res.status(201).json({ success: true, transaction: tx });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

// Update business transaction category
router.put('/transactions/:id/category', (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const userId = req.user.id;
    const db = getDb();
    
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    const checkStmt = db.prepare(`
      SELECT bt.*, b.user_id 
      FROM business_transactions bt
      JOIN businesses b ON bt.business_id = b.id
      WHERE bt.id = ?
    `);
    const tx = checkStmt.get(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const stmt = db.prepare('UPDATE business_transactions SET category = ? WHERE id = ?');
    stmt.run(category, id);
    
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete business transaction
router.delete('/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const db = getDb();
    
    const checkStmt = db.prepare(`
      SELECT bt.*, b.user_id 
      FROM business_transactions bt
      JOIN businesses b ON bt.business_id = b.id
      WHERE bt.id = ?
    `);
    const tx = checkStmt.get(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
    const stmt = db.prepare('DELETE FROM business_transactions WHERE id = ?');
    stmt.run(id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ============================================
// BUSINESS PROFIT & LOSS
// ============================================

// Get P&L summary for a business
router.get('/:businessId/profit-loss', (req, res) => {
  try {
    const { businessId } = req.params;
    const { period = 'month' } = req.query;
    const userId = req.user.id;
    const db = getDb();
    
    const checkStmt = db.prepare('SELECT user_id FROM businesses WHERE id = ?');
    const business = checkStmt.get(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    
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
    } else if (period === 'year') {
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
    } else {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }
    
    const stmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN type IN ('income', 'received', 'deposit') THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type IN ('expense', 'sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as total_transactions,
        SUM(CASE WHEN type IN ('income', 'received', 'deposit') THEN 1 ELSE 0 END) as income_count,
        SUM(CASE WHEN type IN ('expense', 'sent', 'airtime', 'till', 'withdraw') THEN 1 ELSE 0 END) as expense_count
      FROM business_transactions 
      WHERE business_id = ? AND transaction_date >= ?
    `);
    
    const result = stmt.get(businessId, startDate.toISOString());
    
    const totalIncome = result.total_income || 0;
    const totalExpenses = result.total_expenses || 0;
    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    
    // Get category breakdown
    const catStmt = db.prepare(`
      SELECT category, 
             SUM(CASE WHEN type IN ('income', 'received', 'deposit') THEN amount ELSE 0 END) as income,
             SUM(CASE WHEN type IN ('expense', 'sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as expenses
      FROM business_transactions 
      WHERE business_id = ? AND transaction_date >= ?
      GROUP BY category
      ORDER BY (income + expenses) DESC
    `);
    
    const categories = catStmt.all(businessId, startDate.toISOString());
    
    res.json({
      period,
      start_date: startDate.toISOString(),
      end_date: now.toISOString(),
      business: {
        id: business.id,
        name: business.name
      },
      profit_loss: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin: profitMargin,
        total_transactions: result.total_transactions || 0,
        income_count: result.income_count || 0,
        expense_count: result.expense_count || 0
      },
      categories
    });
    
  } catch (error) {
    console.error('P&L error:', error);
    res.status(500).json({ error: 'Failed to calculate profit and loss' });
  }
});

module.exports = router;