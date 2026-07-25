const { getDb, initializeDatabase } = require('../src/db');

function seedAgriculture() {
    console.log('🌱 Seeding agriculture data...');
    
    initializeDatabase();
    const db = getDb();
    
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@pesamind.com');
    if (!user) {
        console.log('❌ Demo user not found. Run seed.js first.');
        return;
    }
    
    // Check if farm exists
    const existing = db.prepare('SELECT id FROM farms WHERE user_id = ?').get(user.id);
    if (existing) {
        console.log('ℹ️ Farm already exists, skipping');
        return;
    }
    
    const farmStmt = db.prepare(`
        INSERT INTO farms (user_id, name, location, size, crop_type, soil_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    farmStmt.run(user.id, 'Rift Valley Farm', 'Njoro, Nakuru', 5, 'Maize', 'Loam');
    const farm = db.prepare('SELECT id FROM farms WHERE user_id = ? AND name = ?').get(user.id, 'Rift Valley Farm');
    
    if (!farm) {
        console.log('❌ Failed to create farm');
        return;
    }
    
    const seasonStmt = db.prepare(`
        INSERT INTO farm_seasons (farm_id, name, season_type, start_date, end_date, crop_type, expected_yield)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    seasonStmt.run(farm.id, '2026 Long Rains', 'planting', '2026-03-01', '2026-08-31', 'Maize', 2000);
    const season = db.prepare('SELECT id FROM farm_seasons WHERE farm_id = ? AND name = ?').get(farm.id, '2026 Long Rains');
    
    if (!season) {
        console.log('❌ Failed to create season');
        return;
    }
    
    // FARM INPUTS (EXPENDITURES) - COMPLETE
    const inputStmt = db.prepare(`
        INSERT INTO farm_inputs (season_id, input_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const inputs = [
        { type: 'seed', category: 'seed', desc: 'Maize seed - H614', qty: 50, unit: 'kg', unitCost: 300, total: 15000, supplier: 'Kenya Seed', date: '2026-03-01', method: 'M-Pesa' },
        { type: 'fertilizer', category: 'fertilizer', desc: 'DAP Fertilizer', qty: 100, unit: 'kg', unitCost: 350, total: 35000, supplier: 'Yara Kenya', date: '2026-03-05', method: 'Bank Transfer' },
        { type: 'fertilizer', category: 'fertilizer', desc: 'CAN Fertilizer', qty: 80, unit: 'kg', unitCost: 280, total: 22400, supplier: 'Yara Kenya', date: '2026-04-10', method: 'M-Pesa' },
        { type: 'pesticide', category: 'pesticide', desc: 'Insecticide spray', qty: 20, unit: 'liters', unitCost: 800, total: 16000, supplier: 'AgroChem', date: '2026-05-15', method: 'Cash' },
        { type: 'herbicide', category: 'herbicide', desc: 'Weed killer', qty: 15, unit: 'liters', unitCost: 600, total: 9000, supplier: 'AgroChem', date: '2026-04-20', method: 'M-Pesa' },
        { type: 'machinery', category: 'machinery', desc: 'Tractor hire - ploughing', qty: 2, unit: 'days', unitCost: 3000, total: 6000, supplier: 'Njoro Tractor Services', date: '2026-03-02', method: 'Cash' },
        { type: 'machinery', category: 'machinery', desc: 'Harvester hire', qty: 1, unit: 'day', unitCost: 5000, total: 5000, supplier: 'Njoro Tractor Services', date: '2026-08-20', method: 'M-Pesa' },
        { type: 'transport', category: 'transport', desc: 'Transport to market', qty: 3, unit: 'trips', unitCost: 2000, total: 6000, supplier: 'Local transport', date: '2026-08-25', method: 'Cash' },
    ];
    
    inputs.forEach(input => {
        inputStmt.run(season.id, input.type, input.category, input.desc, input.qty, input.unit, input.unitCost, input.total, input.supplier, input.date, input.method);
    });
    
    // FARM LABOUR - NEW
    const labourStmt = db.prepare(`
        INSERT INTO farm_labour (season_id, worker_name, worker_phone, task_type, description, days_worked, daily_wage, total_wage, work_date, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const labour = [
        { name: 'John Mwangi', phone: '0712345678', task: 'planting', desc: 'Maize planting', days: 10, wage: 500, total: 5000, date: '2026-03-03', status: 'paid' },
        { name: 'Mary Wanjiru', phone: '0723456789', task: 'weeding', desc: 'First weeding', days: 8, wage: 500, total: 4000, date: '2026-04-10', status: 'paid' },
        { name: 'Peter Kiprop', phone: '0734567890', task: 'weeding', desc: 'Second weeding', days: 7, wage: 500, total: 3500, date: '2026-05-20', status: 'paid' },
        { name: 'James Ochieng', phone: '0745678901', task: 'harvesting', desc: 'Maize harvesting', days: 12, wage: 600, total: 7200, date: '2026-08-22', status: 'pending' },
    ];
    
    labour.forEach(l => {
        labourStmt.run(season.id, l.name, l.phone, l.task, l.desc, l.days, l.wage, l.total, l.date, l.status);
    });
    
    // FARM OUTPUTS - COMPLETE
    const outputStmt = db.prepare(`
        INSERT INTO farm_outputs (season_id, output_type, category, description, quantity, unit, unit_price, total_value, buyer, sale_date, payment_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const outputs = [
        { type: 'harvest', category: 'harvest', desc: 'Maize harvest', qty: 1800, unit: 'kg', price: 45, total: 81000, buyer: 'National Cereals Board', date: '2026-08-28', method: 'Bank Transfer' },
        { type: 'sale', category: 'sale', desc: 'Maize sale to local miller', qty: 500, unit: 'kg', price: 50, total: 25000, buyer: 'Njoro Millers', date: '2026-09-05', method: 'M-Pesa' },
        { type: 'byproduct', category: 'byproduct', desc: 'Maize stalks for animal feed', qty: 500, unit: 'kg', price: 10, total: 5000, buyer: 'Local dairy farmer', date: '2026-09-10', method: 'Cash' },
    ];
    
    outputs.forEach(output => {
        outputStmt.run(season.id, output.type, output.category, output.desc, output.qty, output.unit, output.price, output.total, output.buyer, output.date, output.method);
    });
    
    console.log(`✅ Added ${inputs.length} inputs, ${labour.length} labour records, and ${outputs.length} outputs`);
    console.log('✅ Agriculture seeding complete!');
}

seedAgriculture();