const { getDb, initializeDatabase } = require('../src/db');

function seedBusiness() {
    console.log('🌱 Seeding business data...');
    
    initializeDatabase();
    const db = getDb();
    
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@pesamind.com');
    if (!user) {
        console.log('❌ Demo user not found. Run seed.js first.');
        return;
    }
    
    // Check if business exists
    const existing = db.prepare('SELECT id FROM businesses WHERE user_id = ?').get(user.id);
    if (existing) {
        console.log('ℹ️ Business already exists, skipping');
        return;
    }
    
    const businessStmt = db.prepare(`
        INSERT INTO businesses (user_id, name, description, type, location)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    const businessResult = businessStmt.run(
        user.id,
        'Green Valley Grocers',
        'Retail grocery store serving the local community',
        'retail',
        'Nakuru Town'
    );
    
    const businessId = businessResult.lastInsertRowid;
    
    if (!businessId) {
        console.log('❌ Failed to create business');
        return;
    }
    
    const txStmt = db.prepare(`
        INSERT INTO business_transactions 
        (business_id, type, amount, counterparty, category, description, transaction_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const sampleTxs = [
        { type: 'income', amount: 45000, counterparty: 'Customer - Jane Muthoni', category: 'Sales', description: 'Weekly grocery sales', date: '2026-07-01T10:00:00.000Z' },
        { type: 'expense', amount: 12000, counterparty: 'Fresh Produce Ltd', category: 'Inventory', description: 'Vegetables restock', date: '2026-07-02T08:00:00.000Z' },
        { type: 'expense', amount: 5000, counterparty: 'Naivas Wholesale', category: 'Inventory', description: 'Dry goods', date: '2026-07-03T09:00:00.000Z' },
        { type: 'income', amount: 32000, counterparty: 'Customer - Peter Kiprop', category: 'Sales', description: 'Bulk order', date: '2026-07-05T14:00:00.000Z' },
        { type: 'expense', amount: 2000, counterparty: 'KPLC', category: 'Utilities', description: 'Electricity bill', date: '2026-07-06T11:00:00.000Z' },
        { type: 'expense', amount: 3500, counterparty: 'Rent - Landlord', category: 'Rent', description: 'Shop rent', date: '2026-07-07T07:00:00.000Z' },
    ];
    
    sampleTxs.forEach(tx => {
        txStmt.run(businessId, tx.type, tx.amount, tx.counterparty, tx.category, tx.description, tx.date);
    });
    
    console.log(`✅ Added ${sampleTxs.length} sample business transactions`);
    console.log('✅ Business seeding complete!');
}

seedBusiness();