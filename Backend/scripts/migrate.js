const { initializeDatabase } = require('../src/db');

console.log('🔄 Running database migration...');
initializeDatabase();
console.log('✅ Migration complete!');