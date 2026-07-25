const express = require('express');
const { getDb } = require('../db');
const { 
  getAllCategories, 
  getUserCategoryOverrides,
  setUserCategoryOverride 
} = require('../utils/categorizer');

const router = express.Router();

// Get all default categories
router.get('/', (req, res) => {
  try {
    const categories = getAllCategories();
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get user category overrides
router.get('/overrides', (req, res) => {
  try {
    const overrides = getUserCategoryOverrides(req.user.id);
    res.json({ overrides });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get overrides' });
  }
});

// Set user category override
router.post('/override', (req, res) => {
  try {
    const { keyword, category } = req.body;
    
    if (!keyword || !category) {
      return res.status(400).json({ error: 'Keyword and category are required' });
    }
    
    const result = setUserCategoryOverride(req.user.id, keyword, category);
    res.json({ success: true, ...result });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to set override' });
  }
});

// Delete user category override
router.delete('/override/:keyword', (req, res) => {
  try {
    const { keyword } = req.params;
    const db = getDb();
    
    const stmt = db.prepare(`
      DELETE FROM user_category_overrides 
      WHERE user_id = ? AND keyword = ?
    `);
    stmt.run(req.user.id, keyword.toUpperCase().trim());
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

module.exports = router;