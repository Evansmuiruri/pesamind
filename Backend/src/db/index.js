const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

function initializeDatabase() {
    if (dbInstance) return dbInstance;

    const dbPath = process.env.DB_PATH || './data/pesamind.db';
    
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Lightweight migrations for columns added after initial release
    // (CREATE TABLE IF NOT EXISTS above won't add columns to tables that
    // already exist on a user's device, so patch them in here).
    try {
        const labourColumns = db.prepare("PRAGMA table_info(farm_labour)").all();
        const hasWageType = labourColumns.some((col) => col.name === 'wage_type');
        if (!hasWageType) {
            db.exec("ALTER TABLE farm_labour ADD COLUMN wage_type TEXT NOT NULL DEFAULT 'daily'");
            console.log('✅ Migrated farm_labour: added wage_type column');
        }
    } catch (migrationError) {
        console.error('Migration warning (farm_labour.wage_type):', migrationError.message);
    }

    console.log('✅ Database initialized with complete schema (all 4 modules)');
    
    dbInstance = db;
    return db;
}

function getDb() {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return dbInstance;
}

module.exports = {
    initializeDatabase,
    getDb
};