const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// ============================================
// ANIMALS CRUD
// ============================================

router.get('/animals', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const stmt = db.prepare(`
            SELECT a.*,
                   (SELECT COUNT(*) FROM milk_production WHERE animal_id = a.id) as milk_record_count,
                   (SELECT MAX(date) FROM milk_production WHERE animal_id = a.id) as last_milk_date
            FROM animals a
            WHERE a.user_id = ?
            ORDER BY a.name ASC
        `);
        const animals = stmt.all(userId);
        res.json({ animals });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch animals' });
    }
});

router.get('/animals/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const animal = db.prepare('SELECT * FROM animals WHERE id = ?').get(id);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        res.json({ animal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch animal' });
    }
});

router.post('/animals', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { tag_id, name, breed, gender, birth_date, status, purchase_date, purchase_price, notes } = req.body;
        if (!tag_id) return res.status(400).json({ error: 'Tag ID is required' });

        const existing = db.prepare('SELECT id FROM animals WHERE tag_id = ?').get(tag_id);
        if (existing) return res.status(409).json({ error: 'An animal with this tag ID already exists' });

        const stmt = db.prepare(`
            INSERT INTO animals (user_id, tag_id, name, breed, gender, birth_date, status, purchase_date, purchase_price, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(userId, tag_id, name, breed, gender, birth_date, status || 'active', purchase_date, purchase_price, notes);
        const animal = db.prepare('SELECT * FROM animals WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, animal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create animal' });
    }
});

router.put('/animals/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { tag_id, name, breed, gender, birth_date, status, purchase_date, purchase_price, notes } = req.body;

        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(id);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });

        const stmt = db.prepare(`
            UPDATE animals SET
                tag_id = COALESCE(?, tag_id),
                name = COALESCE(?, name),
                breed = COALESCE(?, breed),
                gender = COALESCE(?, gender),
                birth_date = COALESCE(?, birth_date),
                status = COALESCE(?, status),
                purchase_date = COALESCE(?, purchase_date),
                purchase_price = COALESCE(?, purchase_price),
                notes = COALESCE(?, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(tag_id, name, breed, gender, birth_date, status, purchase_date, purchase_price, notes, id);
        const updated = db.prepare('SELECT * FROM animals WHERE id = ?').get(id);
        res.json({ success: true, animal: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update animal' });
    }
});

router.delete('/animals/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(id);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        db.prepare('DELETE FROM animals WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete animal' });
    }
});

// ============================================
// MILK PRODUCTION (Daily Tracking)
// ============================================

router.get('/animals/:animalId/milk', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const { startDate, endDate } = req.query;
        
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        let query = 'SELECT * FROM milk_production WHERE animal_id = ?';
        const params = [animalId];
        if (startDate) { query += ' AND date >= ?'; params.push(startDate); }
        if (endDate) { query += ' AND date <= ?'; params.push(endDate); }
        query += ' ORDER BY date DESC';
        
        const stmt = db.prepare(query);
        const records = stmt.all(...params);
        res.json({ records });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch milk records' });
    }
});

router.post('/animals/:animalId/milk', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const { date, morning_yield, evening_yield, total_yield, fat_content, protein_content, notes } = req.body;
        
        if (!date) return res.status(400).json({ error: 'Date is required' });
        
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        let total = total_yield;
        if (total === undefined) {
            total = (morning_yield || 0) + (evening_yield || 0);
        }
        if (total === 0) return res.status(400).json({ error: 'Total yield must be greater than 0' });
        
        const duplicateCheck = db.prepare('SELECT id FROM milk_production WHERE animal_id = ? AND date = ?').get(animalId, date);
        if (duplicateCheck) return res.status(409).json({ error: 'Record for this date already exists' });
        
        const stmt = db.prepare(`
            INSERT INTO milk_production (animal_id, date, morning_yield, evening_yield, total_yield, fat_content, protein_content, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(animalId, date, morning_yield, evening_yield, total, fat_content, protein_content, notes);
        const record = db.prepare('SELECT * FROM milk_production WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, record });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add milk record' });
    }
});

router.put('/milk/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { date, morning_yield, evening_yield, total_yield, fat_content, protein_content, notes } = req.body;
        
        const checkStmt = db.prepare(`SELECT mp.*, a.user_id FROM milk_production mp JOIN animals a ON mp.animal_id = a.id WHERE mp.id = ?`);
        const record = checkStmt.get(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        if (record.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        let total = total_yield;
        if (total === undefined) total = (morning_yield || 0) + (evening_yield || 0);
        
        const stmt = db.prepare(`UPDATE milk_production SET date = COALESCE(?, date), morning_yield = COALESCE(?, morning_yield), evening_yield = COALESCE(?, evening_yield), total_yield = COALESCE(?, total_yield), fat_content = COALESCE(?, fat_content), protein_content = COALESCE(?, protein_content), notes = COALESCE(?, notes) WHERE id = ?`);
        stmt.run(date, morning_yield, evening_yield, total, fat_content, protein_content, notes, id);
        const updated = db.prepare('SELECT * FROM milk_production WHERE id = ?').get(id);
        res.json({ success: true, record: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update milk record' });
    }
});

router.delete('/milk/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`SELECT mp.*, a.user_id FROM milk_production mp JOIN animals a ON mp.animal_id = a.id WHERE mp.id = ?`);
        const record = checkStmt.get(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        if (record.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM milk_production WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete milk record' });
    }
});

// ============================================
// FEED COSTS - DETAILED
// ============================================

const FEED_CATEGORIES = ['hay', 'silage', 'concentrate', 'mineral', 'pasture', 'other'];

router.get('/animals/:animalId/feed', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM feed_costs WHERE animal_id = ? ORDER BY purchase_date DESC`);
        const costs = stmt.all(animalId);
        res.json({ feed_costs: costs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch feed costs' });
    }
});

router.post('/animals/:animalId/feed', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const { feed_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message } = req.body;
        
        if (!feed_type || total_cost === undefined) {
            return res.status(400).json({ error: 'Feed type and total cost are required' });
        }
        
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            INSERT INTO feed_costs (animal_id, feed_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(animalId, feed_type, category || 'other', description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message);
        const cost = db.prepare('SELECT * FROM feed_costs WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, feed_cost: cost });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add feed cost' });
    }
});

router.put('/feed/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { feed_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number } = req.body;
        
        const checkStmt = db.prepare(`SELECT fc.*, a.user_id FROM feed_costs fc JOIN animals a ON fc.animal_id = a.id WHERE fc.id = ?`);
        const cost = checkStmt.get(id);
        if (!cost) return res.status(404).json({ error: 'Feed cost not found' });
        if (cost.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`UPDATE feed_costs SET feed_type = COALESCE(?, feed_type), category = COALESCE(?, category), description = COALESCE(?, description), quantity = COALESCE(?, quantity), unit = COALESCE(?, unit), unit_cost = COALESCE(?, unit_cost), total_cost = COALESCE(?, total_cost), supplier = COALESCE(?, supplier), purchase_date = COALESCE(?, purchase_date), payment_method = COALESCE(?, payment_method), reference_number = COALESCE(?, reference_number) WHERE id = ?`);
        stmt.run(feed_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, id);
        const updated = db.prepare('SELECT * FROM feed_costs WHERE id = ?').get(id);
        res.json({ success: true, feed_cost: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update feed cost' });
    }
});

router.delete('/feed/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`SELECT fc.*, a.user_id FROM feed_costs fc JOIN animals a ON fc.animal_id = a.id WHERE fc.id = ?`);
        const cost = checkStmt.get(id);
        if (!cost) return res.status(404).json({ error: 'Feed cost not found' });
        if (cost.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM feed_costs WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete feed cost' });
    }
});

// ============================================
// ACARICIDES (Tick Control) - NEW
// ============================================

router.get('/animals/:animalId/acaricides', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM acaricide_records WHERE animal_id = ? OR animal_id IS NULL ORDER BY application_date DESC`);
        const records = stmt.all(animalId);
        res.json({ acaricide_records: records });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch acaricide records' });
    }
});

router.post('/animals/:animalId/acaricides', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const { application_date, product_name, quantity, unit, unit_cost, total_cost, application_method, notes } = req.body;
        
        if (!application_date || !product_name || total_cost === undefined) {
            return res.status(400).json({ error: 'Application date, product name, and total cost are required' });
        }
        
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            INSERT INTO acaricide_records (animal_id, application_date, product_name, quantity, unit, unit_cost, total_cost, application_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(animalId, application_date, product_name, quantity, unit, unit_cost, total_cost, application_method, notes);
        const record = db.prepare('SELECT * FROM acaricide_records WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, acaricide_record: record });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add acaricide record' });
    }
});

router.delete('/acaricides/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`
            SELECT ar.*, a.user_id FROM acaricide_records ar
            LEFT JOIN animals a ON ar.animal_id = a.id
            WHERE ar.id = ?
        `);
        const record = checkStmt.get(id);
        if (!record) return res.status(404).json({ error: 'Acaricide record not found' });
        if (record.user_id && record.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM acaricide_records WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete acaricide record' });
    }
});

// ============================================
// VETERINARY RECORDS
// ============================================

router.get('/animals/:animalId/vet', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM veterinary_records WHERE animal_id = ? ORDER BY visit_date DESC`);
        const records = stmt.all(animalId);
        res.json({ vet_records: records });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vet records' });
    }
});

router.post('/animals/:animalId/vet', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { animalId } = req.params;
        const { visit_date, diagnosis, treatment, medications, cost, vet_name, notes } = req.body;
        
        if (!visit_date) return res.status(400).json({ error: 'Visit date is required' });
        
        const checkStmt = db.prepare('SELECT user_id FROM animals WHERE id = ?');
        const animal = checkStmt.get(animalId);
        if (!animal) return res.status(404).json({ error: 'Animal not found' });
        if (animal.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            INSERT INTO veterinary_records (animal_id, visit_date, diagnosis, treatment, medications, cost, vet_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(animalId, visit_date, diagnosis, treatment, medications, cost, vet_name, notes);
        const record = db.prepare('SELECT * FROM veterinary_records WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, vet_record: record });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add vet record' });
    }
});

router.delete('/vet/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`SELECT vr.*, a.user_id FROM veterinary_records vr JOIN animals a ON vr.animal_id = a.id WHERE vr.id = ?`);
        const record = checkStmt.get(id);
        if (!record) return res.status(404).json({ error: 'Vet record not found' });
        if (record.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM veterinary_records WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete vet record' });
    }
});

// ============================================
// MILK SALES
// ============================================

router.get('/milk-sales', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { startDate, endDate } = req.query;
        
        let query = 'SELECT * FROM milk_sales WHERE user_id = ?';
        const params = [userId];
        if (startDate) { query += ' AND sale_date >= ?'; params.push(startDate); }
        if (endDate) { query += ' AND sale_date <= ?'; params.push(endDate); }
        query += ' ORDER BY sale_date DESC';
        
        const stmt = db.prepare(query);
        const sales = stmt.all(...params);
        const totalQuantity = sales.reduce((sum, s) => sum + s.quantity_liters, 0);
        const totalRevenue = sales.reduce((sum, s) => sum + s.total_revenue, 0);
        
        res.json({
            sales,
            summary: {
                total_sales: sales.length,
                total_quantity_liters: totalQuantity,
                total_revenue: totalRevenue,
                avg_price_per_liter: totalQuantity > 0 ? totalRevenue / totalQuantity : 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch milk sales' });
    }
});

router.post('/milk-sales', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { sale_date, quantity_liters, price_per_liter, total_revenue, buyer_name, buyer_phone, payment_method, notes } = req.body;
        
        if (!sale_date || !quantity_liters || !price_per_liter) {
            return res.status(400).json({ error: 'Sale date, quantity, and price are required' });
        }
        
        const total = total_revenue || (quantity_liters * price_per_liter);
        
        const stmt = db.prepare(`
            INSERT INTO milk_sales (user_id, sale_date, quantity_liters, price_per_liter, total_revenue, buyer_name, buyer_phone, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(userId, sale_date, quantity_liters, price_per_liter, total, buyer_name, buyer_phone, payment_method, notes);
        const sale = db.prepare('SELECT * FROM milk_sales WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, sale });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add milk sale' });
    }
});

router.put('/milk-sales/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { sale_date, quantity_liters, price_per_liter, total_revenue, buyer_name, buyer_phone, payment_method, status, notes } = req.body;
        
        const checkStmt = db.prepare('SELECT user_id FROM milk_sales WHERE id = ?');
        const sale = checkStmt.get(id);
        if (!sale) return res.status(404).json({ error: 'Sale not found' });
        if (sale.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const total = total_revenue || (quantity_liters * price_per_liter);
        
        const stmt = db.prepare(`
            UPDATE milk_sales 
            SET sale_date = COALESCE(?, sale_date),
                quantity_liters = COALESCE(?, quantity_liters),
                price_per_liter = COALESCE(?, price_per_liter),
                total_revenue = COALESCE(?, total_revenue),
                buyer_name = COALESCE(?, buyer_name),
                buyer_phone = COALESCE(?, buyer_phone),
                payment_method = COALESCE(?, payment_method),
                status = COALESCE(?, status),
                notes = COALESCE(?, notes)
            WHERE id = ?
        `);
        
        stmt.run(sale_date, quantity_liters, price_per_liter, total, buyer_name, buyer_phone, payment_method, status, notes, id);
        const updated = db.prepare('SELECT * FROM milk_sales WHERE id = ?').get(id);
        res.json({ success: true, sale: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update milk sale' });
    }
});

router.delete('/milk-sales/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM milk_sales WHERE id = ?');
        const sale = checkStmt.get(id);
        if (!sale) return res.status(404).json({ error: 'Sale not found' });
        if (sale.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM milk_sales WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete milk sale' });
    }
});

// ============================================
// DAIRY PROFITABILITY (UPDATED)
// ============================================

router.get('/profitability', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate;
        if (period === 'week') { startDate = new Date(now); startDate.setDate(now.getDate() - 7); }
        else if (period === 'month') { startDate = new Date(now); startDate.setMonth(now.getMonth() - 1); }
        else if (period === 'quarter') { startDate = new Date(now); startDate.setMonth(now.getMonth() - 3); }
        else if (period === 'year') { startDate = new Date(now); startDate.setFullYear(now.getFullYear() - 1); }
        else { startDate = new Date(now); startDate.setMonth(now.getMonth() - 1); }
        
        const startDateStr = startDate.toISOString().split('T')[0];
        
        const animalStmt = db.prepare('SELECT id, tag_id, name, breed, status FROM animals WHERE user_id = ?');
        const animals = animalStmt.all(userId);
        
        const animalProfitability = animals.map(animal => {
            // Milk production
            const milkStmt = db.prepare(`SELECT SUM(total_yield) as total_milk FROM milk_production WHERE animal_id = ? AND date >= ?`);
            const milkTotal = milkStmt.get(animal.id, startDateStr);
            const totalMilk = milkTotal?.total_milk || 0;
            
            // Milk sales revenue
            const milkSalesStmt = db.prepare(`SELECT SUM(total_revenue) as total_revenue FROM milk_sales WHERE user_id = ? AND sale_date >= ?`);
            const salesTotal = milkSalesStmt.get(userId, startDateStr);
            const milkRevenue = salesTotal?.total_revenue || 0;
            
            // Feed costs
            const feedStmt = db.prepare(`SELECT SUM(total_cost) as total_feed FROM feed_costs WHERE animal_id = ? AND purchase_date >= ?`);
            const feedTotal = feedStmt.get(animal.id, startDateStr);
            const feedCost = feedTotal?.total_feed || 0;
            
            // Veterinary costs
            const vetStmt = db.prepare(`SELECT SUM(cost) as total_vet FROM veterinary_records WHERE animal_id = ? AND visit_date >= ?`);
            const vetTotal = vetStmt.get(animal.id, startDateStr);
            const vetCost = vetTotal?.total_vet || 0;
            
            // Acaricide costs
            const acaricideStmt = db.prepare(`SELECT SUM(total_cost) as total_acaricide FROM acaricide_records WHERE (animal_id = ? OR animal_id IS NULL) AND application_date >= ?`);
            const acaricideTotal = acaricideStmt.get(animal.id, startDateStr);
            const acaricideCost = acaricideTotal?.total_acaricide || 0;
            
            const totalCost = feedCost + vetCost + acaricideCost;
            const profit = milkRevenue - totalCost;
            
            return {
                ...animal,
                total_milk: totalMilk,
                milk_revenue: milkRevenue,
                feed_cost: feedCost,
                vet_cost: vetCost,
                acaricide_cost: acaricideCost,
                total_cost: totalCost,
                profit: profit,
                profit_margin: milkRevenue > 0 ? (profit / milkRevenue) * 100 : 0
            };
        });
        
        const totalMilk = animalProfitability.reduce((sum, a) => sum + a.total_milk, 0);
        const totalRevenue = animalProfitability.reduce((sum, a) => sum + a.milk_revenue, 0);
        const totalCosts = animalProfitability.reduce((sum, a) => sum + a.total_cost, 0);
        const totalProfit = totalRevenue - totalCosts;
        
        res.json({
            period,
            start_date: startDateStr,
            end_date: now.toISOString().split('T')[0],
            summary: {
                total_animals: animals.length,
                active_animals: animals.filter(a => a.status === 'active').length,
                total_milk_produced: totalMilk,
                total_revenue: totalRevenue,
                total_costs: totalCosts,
                total_profit: totalProfit,
                profit_margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
            },
            animals: animalProfitability
        });
    } catch (error) {
        console.error('Dairy profitability error:', error);
        res.status(500).json({ error: 'Failed to calculate dairy profitability' });
    }
});

module.exports = router;