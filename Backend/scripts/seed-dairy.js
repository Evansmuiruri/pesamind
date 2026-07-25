const { getDb, initializeDatabase } = require('../src/db');

function seedDairy() {
    console.log('🌱 Seeding dairy data with enhanced features...');
    
    initializeDatabase();
    const db = getDb();
    
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@pesamind.com');
    if (!user) {
        console.log('❌ Demo user not found. Run seed.js first.');
        return;
    }
    
    // Check if animals exist
    const existing = db.prepare('SELECT id FROM animals WHERE user_id = ?').get(user.id);
    if (existing) {
        console.log('ℹ️ Dairy data already exists, skipping');
        return;
    }
    
    console.log('🐄 Creating dairy animals and records...');
    
    // ============================================
    // 1. ANIMALS
    // ============================================
    const animalStmt = db.prepare(`
        INSERT INTO animals (user_id, tag_id, name, breed, gender, birth_date, status, purchase_date, purchase_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const animals = [
        { 
            tag_id: 'FR001', name: 'Bella', breed: 'Friesian', gender: 'female', 
            birth_date: '2020-03-15', status: 'active', purchase_date: '2020-04-01', purchase_price: 45000 
        },
        { 
            tag_id: 'FR002', name: 'Daisy', breed: 'Friesian', gender: 'female', 
            birth_date: '2021-06-20', status: 'active', purchase_date: '2021-07-01', purchase_price: 38000 
        },
        { 
            tag_id: 'AH003', name: 'Brownie', breed: 'Ayrshire', gender: 'female', 
            birth_date: '2019-08-10', status: 'active', purchase_date: '2019-09-01', purchase_price: 42000 
        },
        { 
            tag_id: 'FR004', name: 'Buttercup', breed: 'Friesian', gender: 'female', 
            birth_date: '2022-01-05', status: 'active', purchase_date: '2022-02-01', purchase_price: 35000 
        },
        { 
            tag_id: 'FR005', name: 'Mable', breed: 'Friesian', gender: 'female', 
            birth_date: '2020-11-12', status: 'sold', purchase_date: '2020-12-01', purchase_price: 40000 
        },
    ];
    
    const animalIds = [];
    animals.forEach(animal => {
        animalStmt.run(
            user.id, 
            animal.tag_id, 
            animal.name, 
            animal.breed, 
            animal.gender, 
            animal.birth_date, 
            animal.status, 
            animal.purchase_date, 
            animal.purchase_price
        );
        const result = db.prepare('SELECT id FROM animals WHERE user_id = ? AND tag_id = ?').get(user.id, animal.tag_id);
        if (result) animalIds.push({ ...animal, id: result.id });
    });
    
    console.log(`✅ Added ${animalIds.length} animals`);
    
    if (animalIds.length === 0) {
        console.log('❌ Failed to create animals');
        return;
    }
    
    // ============================================
    // 2. DAILY MILK PRODUCTION RECORDS
    // ============================================
    const milkStmt = db.prepare(`
        INSERT INTO milk_production (animal_id, date, morning_yield, evening_yield, total_yield, fat_content, protein_content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const today = new Date();
    let milkRecords = 0;
    
    // Generate records for last 30 days
    const activeAnimals = animalIds.filter(a => a.status === 'active');
    
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        activeAnimals.forEach(animal => {
            // Different yields based on animal
            let baseMorning, baseEvening;
            if (animal.name === 'Bella') {
                baseMorning = 14 + Math.random() * 4;
                baseEvening = 10 + Math.random() * 3;
            } else if (animal.name === 'Daisy') {
                baseMorning = 12 + Math.random() * 4;
                baseEvening = 8 + Math.random() * 3;
            } else if (animal.name === 'Brownie') {
                baseMorning = 10 + Math.random() * 3;
                baseEvening = 7 + Math.random() * 3;
            } else {
                baseMorning = 8 + Math.random() * 4;
                baseEvening = 6 + Math.random() * 3;
            }
            
            const morning = Math.round(baseMorning * 10) / 10;
            const evening = Math.round(baseEvening * 10) / 10;
            const total = morning + evening;
            const fat = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
            const protein = Math.round((3.0 + Math.random() * 1.0) * 10) / 10;
            
            milkStmt.run(animal.id, dateStr, morning, evening, total, fat, protein);
            milkRecords++;
        });
    }
    
    console.log(`✅ Added ${milkRecords} milk production records`);
    
    // ============================================
    // 3. FEED COSTS (DETAILED)
    // ============================================
    const feedStmt = db.prepare(`
        INSERT INTO feed_costs (animal_id, feed_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const feedRecords = [
        // Bella's feed
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            type: 'hay', category: 'hay', desc: 'Premium Timothy Hay', qty: 20, unit: 'bales', 
            unitCost: 350, total: 7000, supplier: 'Hay Supplier Ltd', date: '2026-07-01', method: 'M-Pesa' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            type: 'concentrate', category: 'concentrate', desc: 'Dairy Meal - 50kg', qty: 4, unit: 'bags', 
            unitCost: 1200, total: 4800, supplier: 'Unga Farm Care', date: '2026-07-05', method: 'Bank Transfer' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            type: 'mineral', category: 'mineral', desc: 'Mineral Supplements', qty: 2, unit: 'kg', 
            unitCost: 400, total: 800, supplier: 'Agrovet', date: '2026-07-10', method: 'Cash' 
        },
        // Daisy's feed
        { 
            animal_id: animalIds.find(a => a.name === 'Daisy')?.id, 
            type: 'silage', category: 'silage', desc: 'Maize Silage', qty: 10, unit: 'kg', 
            unitCost: 150, total: 1500, supplier: 'Silage Experts', date: '2026-07-02', method: 'M-Pesa' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Daisy')?.id, 
            type: 'concentrate', category: 'concentrate', desc: 'Dairy Meal - 50kg', qty: 3, unit: 'bags', 
            unitCost: 1200, total: 3600, supplier: 'Unga Farm Care', date: '2026-07-08', method: 'M-Pesa' 
        },
        // Brownie's feed
        { 
            animal_id: animalIds.find(a => a.name === 'Brownie')?.id, 
            type: 'hay', category: 'hay', desc: 'Local Hay Bale', qty: 15, unit: 'bales', 
            unitCost: 200, total: 3000, supplier: 'Local Farmer', date: '2026-07-03', method: 'Cash' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Brownie')?.id, 
            type: 'mineral', category: 'mineral', desc: 'Mineral Block', qty: 3, unit: 'kg', 
            unitCost: 300, total: 900, supplier: 'Agrovet', date: '2026-07-12', method: 'M-Pesa' 
        },
        // Buttercup's feed
        { 
            animal_id: animalIds.find(a => a.name === 'Buttercup')?.id, 
            type: 'concentrate', category: 'concentrate', desc: 'Dairy Meal - 50kg', qty: 2, unit: 'bags', 
            unitCost: 1200, total: 2400, supplier: 'Unga Farm Care', date: '2026-07-06', method: 'Bank Transfer' 
        },
        // General feed (all animals)
        { 
            animal_id: null, 
            type: 'pasture', category: 'pasture', desc: 'Pasture Management - General', qty: 1, unit: 'month', 
            unitCost: 2000, total: 2000, supplier: 'Farm Manager', date: '2026-07-01', method: 'Cash' 
        },
    ];
    
    feedRecords.forEach(feed => {
        if (feed.animal_id) {
            feedStmt.run(feed.animal_id, feed.type, feed.category, feed.desc, feed.qty, feed.unit, feed.unitCost, feed.total, feed.supplier, feed.date, feed.method);
        } else {
            // General feed - apply to all active animals
            activeAnimals.forEach(animal => {
                feedStmt.run(animal.id, feed.type, feed.category, feed.desc, feed.qty, feed.unit, feed.unitCost, feed.total, feed.supplier, feed.date, feed.method);
            });
        }
    });
    
    console.log(`✅ Added ${feedRecords.length} feed cost records`);
    
    // ============================================
    // 4. ACARICIDES (TICK CONTROL) - NEW
    // ============================================
    const acaricideStmt = db.prepare(`
        INSERT INTO acaricide_records (animal_id, application_date, product_name, quantity, unit, unit_cost, total_cost, application_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const acaricideRecords = [
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            date: '2026-07-01', product: 'Ectosolve', qty: 2, unit: 'liters', 
            unitCost: 350, total: 700, method: 'Spray', notes: 'Monthly tick control' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Daisy')?.id, 
            date: '2026-07-03', product: 'Acaricide Plus', qty: 1, unit: 'liters', 
            unitCost: 450, total: 450, method: 'Dip', notes: 'Tick infestation' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Brownie')?.id, 
            date: '2026-07-05', product: 'Ectosolve', qty: 1, unit: 'liters', 
            unitCost: 350, total: 350, method: 'Spray', notes: 'Regular control' 
        },
        { 
            animal_id: null, // General application for all animals
            date: '2026-07-10', product: 'Tick Buster', qty: 5, unit: 'liters', 
            unitCost: 300, total: 1500, method: 'Spray', notes: 'Farm-wide tick control' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Buttercup')?.id, 
            date: '2026-07-12', product: 'Acaricide Plus', qty: 1, unit: 'liters', 
            unitCost: 450, total: 450, method: 'Dip', notes: 'Routine treatment' 
        },
    ];
    
    acaricideRecords.forEach(record => {
        acaricideStmt.run(
            record.animal_id, 
            record.date, 
            record.product, 
            record.qty, 
            record.unit, 
            record.unitCost, 
            record.total, 
            record.method, 
            record.notes
        );
    });
    
    console.log(`✅ Added ${acaricideRecords.length} acaricide (tick control) records`);
    
    // ============================================
    // 5. VETERINARY RECORDS
    // ============================================
    const vetStmt = db.prepare(`
        INSERT INTO veterinary_records (animal_id, visit_date, diagnosis, treatment, medications, cost, vet_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const vetRecords = [
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            date: '2026-06-15', diagnosis: 'Mastitis', treatment: 'Antibiotics and anti-inflammatory', 
            medications: 'Penicillin, Flunixin', cost: 2500, vet: 'Dr. Kamau' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Brownie')?.id, 
            date: '2026-06-20', diagnosis: 'Foot rot', treatment: 'Foot bath and antibiotics', 
            medications: 'Oxytetracycline', cost: 1800, vet: 'Dr. Ochieng' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Daisy')?.id, 
            date: '2026-07-01', diagnosis: 'Routine checkup', treatment: 'Deworming and vaccination', 
            medications: 'Dewormer, FMD Vaccine', cost: 800, vet: 'Dr. Kamau' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Bella')?.id, 
            date: '2026-07-05', diagnosis: 'Milk fever', treatment: 'Calcium supplementation', 
            medications: 'Calcium Borogluconate', cost: 1200, vet: 'Dr. Ochieng' 
        },
        { 
            animal_id: animalIds.find(a => a.name === 'Buttercup')?.id, 
            date: '2026-07-10', diagnosis: 'Eye infection', treatment: 'Antibiotic eye drops', 
            medications: 'Tetracycline ointment', cost: 600, vet: 'Dr. Kamau' 
        },
    ];
    
    vetRecords.forEach(record => {
        if (record.animal_id) {
            vetStmt.run(record.animal_id, record.date, record.diagnosis, record.treatment, record.medications, record.cost, record.vet);
        }
    });
    
    console.log(`✅ Added ${vetRecords.length} veterinary records`);
    
    // ============================================
    // 6. MILK SALES
    // ============================================
    const saleStmt = db.prepare(`
        INSERT INTO milk_sales (user_id, sale_date, quantity_liters, price_per_liter, total_revenue, buyer_name, buyer_phone, payment_method, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const sales = [
        { date: '2026-07-01', qty: 45, price: 55, total: 2475, buyer: 'Brookside Dairy', phone: '0712345678', method: 'Bank Transfer', status: 'completed' },
        { date: '2026-07-03', qty: 48, price: 55, total: 2640, buyer: 'Brookside Dairy', phone: '0712345678', method: 'Bank Transfer', status: 'completed' },
        { date: '2026-07-05', qty: 50, price: 55, total: 2750, buyer: 'Brookside Dairy', phone: '0712345678', method: 'M-Pesa', status: 'completed' },
        { date: '2026-07-08', qty: 42, price: 55, total: 2310, buyer: 'Brookside Dairy', phone: '0712345678', method: 'Bank Transfer', status: 'completed' },
        { date: '2026-07-10', qty: 52, price: 55, total: 2860, buyer: 'Brookside Dairy', phone: '0712345678', method: 'M-Pesa', status: 'completed' },
        { date: '2026-07-12', qty: 47, price: 56, total: 2632, buyer: 'Brookside Dairy', phone: '0712345678', method: 'Bank Transfer', status: 'completed' },
        { date: '2026-07-14', qty: 55, price: 56, total: 3080, buyer: 'Brookside Dairy', phone: '0712345678', method: 'M-Pesa', status: 'pending' },
        { date: '2026-07-16', qty: 38, price: 60, total: 2280, buyer: 'Local Hotel', phone: '0723456789', method: 'Cash', status: 'completed' },
        { date: '2026-07-18', qty: 50, price: 56, total: 2800, buyer: 'Brookside Dairy', phone: '0712345678', method: 'Bank Transfer', status: 'completed' },
        { date: '2026-07-20', qty: 44, price: 58, total: 2552, buyer: 'Local Hotel', phone: '0723456789', method: 'Cash', status: 'completed' },
    ];
    
    sales.forEach(sale => {
        saleStmt.run(
            user.id, 
            sale.date, 
            sale.qty, 
            sale.price, 
            sale.total, 
            sale.buyer, 
            sale.phone, 
            sale.method, 
            sale.status
        );
    });
    
    console.log(`✅ Added ${sales.length} milk sales records`);
    
    // ============================================
    // 7. DAIRY PROFITABILITY SUMMARY
    // ============================================
    console.log('\n📊 DAIRY PROFITABILITY SUMMARY:');
    console.log('========================================');
    
    // Calculate totals
    const totalAnimals = activeAnimals.length;
    const totalMilkSales = sales.reduce((sum, s) => sum + s.total, 0);
    
    const feedCostTotal = feedRecords.reduce((sum, f) => sum + f.total, 0);
    const vetCostTotal = vetRecords.reduce((sum, v) => sum + v.cost, 0);
    const acaricideTotal = acaricideRecords.reduce((sum, a) => sum + a.total, 0);
    const totalCosts = feedCostTotal + vetCostTotal + acaricideTotal;
    const totalProfit = totalMilkSales - totalCosts;
    
    console.log(`🐄 Active Animals: ${totalAnimals}`);
    console.log(`💰 Total Milk Revenue: KSh ${totalMilkSales.toFixed(2)}`);
    console.log(`📦 Total Feed Costs: KSh ${feedCostTotal.toFixed(2)}`);
    console.log(`💉 Total Vet Costs: KSh ${vetCostTotal.toFixed(2)}`);
    console.log(`🧪 Total Acaricide Costs: KSh ${acaricideTotal.toFixed(2)}`);
    console.log(`📊 Total Costs: KSh ${totalCosts.toFixed(2)}`);
    console.log(`📈 Total Profit: KSh ${totalProfit.toFixed(2)}`);
    console.log(`📊 Profit Margin: ${totalMilkSales > 0 ? ((totalProfit / totalMilkSales) * 100).toFixed(1) : 0}%`);
    
    // Per animal profitability
    console.log('\n🐄 PER ANIMAL SUMMARY:');
    console.log('----------------------------------------');
    activeAnimals.forEach(animal => {
        // Calculate per animal
        const animalMilk = milkRecords > 0 ? 'Yes' : 'No';
        const animalFeed = feedRecords.filter(f => f.animal_id === animal.id).length;
        const animalVet = vetRecords.filter(v => v.animal_id === animal.id).length;
        const animalAcaricide = acaricideRecords.filter(a => a.animal_id === animal.id || a.animal_id === null).length;
        
        console.log(`${animal.name} (${animal.tag_id}):`);
        console.log(`  - Feed Records: ${animalFeed}`);
        console.log(`  - Vet Records: ${animalVet}`);
        console.log(`  - Acaricide Applications: ${animalAcaricide}`);
        console.log(`  - Status: ${animal.status}`);
    });
    
    console.log('\n✅ Dairy seeding complete!');
    console.log(`📊 Total Records Added:`);
    console.log(`   - Animals: ${animalIds.length}`);
    console.log(`   - Milk Records: ${milkRecords}`);
    console.log(`   - Feed Costs: ${feedRecords.length}`);
    console.log(`   - Acaricides: ${acaricideRecords.length}`);
    console.log(`   - Vet Records: ${vetRecords.length}`);
    console.log(`   - Milk Sales: ${sales.length}`);
}

seedDairy();