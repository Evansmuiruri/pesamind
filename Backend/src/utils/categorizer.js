const { getDb } = require('../db');

function getCategoryForKeyword(keyword) {
  if (!keyword) return 'Uncategorized';
  
  const db = getDb();
  const normalized = keyword.toUpperCase().trim();
  
  const stmt = db.prepare(`
    SELECT category FROM categories 
    WHERE keyword = ? OR ? LIKE '%' || keyword || '%'
    ORDER BY LENGTH(keyword) DESC
    LIMIT 1
  `);
  
  const result = stmt.get(normalized, normalized);
  return result ? result.category : 'Uncategorized';
}

function getCategoryForKeywordWithUserOverride(userId, keyword) {
  if (!keyword) return 'Uncategorized';
  
  const db = getDb();
  const normalized = keyword.toUpperCase().trim();
  
  // Check user override first
  const overrideStmt = db.prepare(`
    SELECT category FROM user_category_overrides 
    WHERE user_id = ? AND keyword = ?
  `);
  const override = overrideStmt.get(userId, normalized);
  if (override) return override.category;
  
  // Fall back to default
  return getCategoryForKeyword(keyword);
}

function setUserCategoryOverride(userId, keyword, category) {
  const db = getDb();
  const normalized = keyword.toUpperCase().trim();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_category_overrides (user_id, keyword, category)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(userId, normalized, category);
  return { keyword: normalized, category };
}

function getAllCategories() {
  const db = getDb();
  const stmt = db.prepare('SELECT DISTINCT category FROM categories ORDER BY category');
  return stmt.all().map(row => row.category);
}

function getUserCategoryOverrides(userId) {
  const db = getDb();
  const stmt = db.prepare('SELECT keyword, category FROM user_category_overrides WHERE user_id = ?');
  return stmt.all(userId);
}

module.exports = {
  getCategoryForKeyword,
  getCategoryForKeywordWithUserOverride,
  setUserCategoryOverride,
  getAllCategories,
  getUserCategoryOverrides
};