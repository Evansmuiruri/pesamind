const { getDb, initializeDatabase } = require('../src/db');
const bcrypt = require('bcrypt');

async function seed() {
  console.log('🌱 Seeding personal finance data...');
  
  initializeDatabase();
  const db = getDb();
  
  // Create demo user
  let existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@pesamind.com');
  
  if (!existing) {
    const passwordHash = await bcrypt.hash('Demo123!', 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash) 
      VALUES (?, ?, ?)
    `).run('Demo User', 'demo@pesamind.com', passwordHash);
    console.log('✅ Demo user created: demo@pesamind.com / Demo123!');
    existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@pesamind.com');
  } else {
    console.log('ℹ️ Demo user already exists');
  }
  
  const userId = existing.id;
  
  // Check if transactions exist
  const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(userId);
  if (txCount.count > 0) {
    console.log(`ℹ️ ${txCount.count} transactions already exist, skipping seed`);
    return;
  }
  
  // Sample transactions
  const sampleTransactions = [
    {
      type: 'received',
      amount: 25000,
      counterparty: 'Salary - Acme Corp',
      category: 'Income',
      raw_message: 'Confirmed. You have received Ksh 25,000 from Acme Corp on 01/07/2026',
      transaction_date: '2026-07-01T10:00:00.000Z'
    },
    {
      type: 'sent',
      amount: 3500,
      counterparty: 'Naivas Supermarket',
      category: 'Groceries',
      raw_message: 'Confirmed. Ksh 3,500 sent to Naivas Supermarket on 02/07/2026',
      transaction_date: '2026-07-02T14:30:00.000Z'
    },
    {
      type: 'sent',
      amount: 1200,
      counterparty: 'Uber',
      category: 'Transport',
      raw_message: 'Confirmed. Ksh 1,200 paid to Uber on 03/07/2026',
      transaction_date: '2026-07-03T09:15:00.000Z'
    },
    {
      type: 'airtime',
      amount: 500,
      counterparty: 'Safaricom',
      category: 'Airtime',
      raw_message: 'Confirmed. Ksh 500 airtime purchased on 04/07/2026',
      transaction_date: '2026-07-04T11:00:00.000Z'
    },
    {
      type: 'received',
      amount: 15000,
      counterparty: 'Client - John Mwangi',
      category: 'Income',
      raw_message: 'Confirmed. You have received Ksh 15,000 from John Mwangi on 05/07/2026',
      transaction_date: '2026-07-05T16:45:00.000Z'
    },
    {
      type: 'sent',
      amount: 8000,
      counterparty: 'Rent - Landlord',
      category: 'Housing',
      raw_message: 'Confirmed. Ksh 8,000 sent to Rent - Landlord on 06/07/2026',
      transaction_date: '2026-07-06T08:00:00.000Z'
    },
    {
      type: 'till',
      amount: 2500,
      counterparty: 'QuickMart',
      category: 'Groceries',
      raw_message: 'Confirmed. Ksh 2,500 paid to QuickMart till number 123456 on 07/07/2026',
      transaction_date: '2026-07-07T12:30:00.000Z'
    },
    {
      type: 'sent',
      amount: 2000,
      counterparty: 'KPLC',
      category: 'Utilities',
      raw_message: 'Confirmed. Ksh 2,000 sent to KPLC on 08/07/2026',
      transaction_date: '2026-07-08T10:00:00.000Z'
    },
    {
      type: 'sent',
      amount: 1500,
      counterparty: 'Equity Bank',
      category: 'Banking',
      raw_message: 'Confirmed. Ksh 1,500 sent to Equity Bank on 09/07/2026',
      transaction_date: '2026-07-09T09:00:00.000Z'
    },
    {
      type: 'received',
      amount: 5000,
      counterparty: 'M-Pesa Transfer - Jane',
      category: 'Transfer',
      raw_message: 'Confirmed. You have received Ksh 5,000 from Jane on 10/07/2026',
      transaction_date: '2026-07-10T13:00:00.000Z'
    }
  ];
  
  const insertStmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, counterparty, category, raw_message, transaction_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  sampleTransactions.forEach(tx => {
    insertStmt.run(userId, tx.type, tx.amount, tx.counterparty, tx.category, tx.raw_message, tx.transaction_date);
  });
  
  console.log(`✅ Added ${sampleTransactions.length} sample transactions`);
  console.log('✅ Personal finance seeding complete!');
}

seed().catch(console.error);