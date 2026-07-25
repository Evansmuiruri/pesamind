const express = require('express');
const { getDb } = require('../db');
const { generateGeminiInsights } = require('../ai/insights');

const router = express.Router();

// Get AI insights
router.get('/', async (req, res) => {
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
    } else {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }
    
    // Get summary
    const summaryStmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN type IN ('received', 'deposit') THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type IN ('sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as total_transactions
      FROM transactions 
      WHERE user_id = ? AND transaction_date >= ?
    `);
    
    const summary = summaryStmt.get(userId, startDate.toISOString());
    
    // Get category breakdown
    const catStmt = db.prepare(`
      SELECT category, COUNT(*) as count, SUM(amount) as total
      FROM transactions 
      WHERE user_id = ? AND transaction_date >= ? AND type NOT IN ('received', 'deposit')
      GROUP BY category
      ORDER BY total DESC
      LIMIT 10
    `);
    
    const categories = catStmt.all(userId, startDate.toISOString());
    
    const fullSummary = {
      period,
      total_income: summary.total_income || 0,
      total_expenses: summary.total_expenses || 0,
      balance: (summary.total_income || 0) - (summary.total_expenses || 0),
      total_transactions: summary.total_transactions || 0
    };
    
    // Generate insights
    const apiKey = process.env.GEMINI_API_KEY;
    const insights = await generateGeminiInsights(fullSummary, categories, apiKey);
    
    res.json({
      period,
      summary: fullSummary,
      insights,
      using_ai: !!apiKey
    });
    
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Get transaction anomalies
router.get('/anomalies', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    
    const stmt = db.prepare(`
      WITH avg_amount AS (
        SELECT AVG(amount) as avg FROM transactions WHERE user_id = ?
      )
      SELECT * FROM transactions 
      WHERE user_id = ? 
      AND amount > (SELECT avg * 2 FROM avg_amount)
      AND amount > 1000
      ORDER BY amount DESC
      LIMIT 10
    `);
    
    const anomalies = stmt.all(userId, userId);
    
    res.json({ anomalies });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

module.exports = router;