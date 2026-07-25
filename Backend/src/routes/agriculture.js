const express = require('express');
const { getDb } = require('../db');
const { parseAgricultureSMS } = require('../parsers/agriculture-sms');

const router = express.Router();

// ============================================
// FARMS CRUD (Unchanged)
// ============================================

router.get('/farms', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const stmt = db.prepare(`
            SELECT f.*, 
                   COUNT(DISTINCT fs.id) as season_count,
                   (SELECT COUNT(*) FROM farm_inputs WHERE season_id IN (SELECT id FROM farm_seasons WHERE farm_id = f.id)) as input_count,
                   (SELECT COUNT(*) FROM farm_outputs WHERE season_id IN (SELECT id FROM farm_seasons WHERE farm_id = f.id)) as output_count
            FROM farms f
            LEFT JOIN farm_seasons fs ON f.id = fs.farm_id
            WHERE f.user_id = ?
            GROUP BY f.id
            ORDER BY f.name ASC
        `);
        const farms = stmt.all(userId);
        res.json({ farms });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch farms' });
    }
});

router.post('/farms', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { name, location, size, size_unit, crop_type, soil_type, notes } = req.body;
        if (!name) return res.status(400).json({ error: 'Farm name is required' });
        const stmt = db.prepare(`INSERT INTO farms (user_id, name, location, size, size_unit, crop_type, soil_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        const result = stmt.run(userId, name, location, size, size_unit || 'acres', crop_type, soil_type, notes);
        const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, farm });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create farm' });
    }
});

router.put('/farms/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { name, location, size, size_unit, crop_type, soil_type, notes } = req.body;
        const checkStmt = db.prepare('SELECT user_id FROM farms WHERE id = ?');
        const farm = checkStmt.get(id);
        if (!farm) return res.status(404).json({ error: 'Farm not found' });
        if (farm.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`UPDATE farms SET name = COALESCE(?, name), location = COALESCE(?, location), size = COALESCE(?, size), size_unit = COALESCE(?, size_unit), crop_type = COALESCE(?, crop_type), soil_type = COALESCE(?, soil_type), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(name, location, size, size_unit, crop_type, soil_type, notes, id);
        const updated = db.prepare('SELECT * FROM farms WHERE id = ?').get(id);
        res.json({ success: true, farm: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update farm' });
    }
});

router.delete('/farms/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM farms WHERE id = ?');
        const farm = checkStmt.get(id);
        if (!farm) return res.status(404).json({ error: 'Farm not found' });
        if (farm.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM farms WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete farm' });
    }
});

// ============================================
// FARM SEASONS (Unchanged)
// ============================================

router.get('/farms/:farmId/seasons', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { farmId } = req.params;
        const checkStmt = db.prepare('SELECT user_id FROM farms WHERE id = ?');
        const farm = checkStmt.get(farmId);
        if (!farm) return res.status(404).json({ error: 'Farm not found' });
        if (farm.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`
            SELECT fs.*,
                   (SELECT SUM(total_cost) FROM farm_inputs WHERE season_id = fs.id) as total_input_cost,
                   (SELECT SUM(total_value) FROM farm_outputs WHERE season_id = fs.id) as total_output_value,
                   (SELECT SUM(total_wage) FROM farm_labour WHERE season_id = fs.id) as total_labour_cost
            FROM farm_seasons fs
            WHERE fs.farm_id = ?
            ORDER BY fs.start_date DESC
        `);
        const seasons = stmt.all(farmId);
        res.json({ seasons });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch seasons' });
    }
});

router.post('/farms/:farmId/seasons', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { farmId } = req.params;
        const { name, season_type, start_date, end_date, crop_type, expected_yield, expected_yield_unit, notes } = req.body;
        if (!name || !start_date) return res.status(400).json({ error: 'Name and start date are required' });
        const checkStmt = db.prepare('SELECT user_id FROM farms WHERE id = ?');
        const farm = checkStmt.get(farmId);
        if (!farm) return res.status(404).json({ error: 'Farm not found' });
        if (farm.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`INSERT INTO farm_seasons (farm_id, name, season_type, start_date, end_date, crop_type, expected_yield, expected_yield_unit, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const result = stmt.run(farmId, name, season_type, start_date, end_date, crop_type, expected_yield, expected_yield_unit || 'kg', notes);
        const season = db.prepare('SELECT * FROM farm_seasons WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, season });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create season' });
    }
});

router.put('/seasons/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { name, season_type, start_date, end_date, crop_type, expected_yield, expected_yield_unit, notes } = req.body;
        const checkStmt = db.prepare(`SELECT fs.*, f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const season = checkStmt.get(id);
        if (!season) return res.status(404).json({ error: 'Season not found' });
        if (season.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`UPDATE farm_seasons SET name = COALESCE(?, name), season_type = COALESCE(?, season_type), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), crop_type = COALESCE(?, crop_type), expected_yield = COALESCE(?, expected_yield), expected_yield_unit = COALESCE(?, expected_yield_unit), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(name, season_type, start_date, end_date, crop_type, expected_yield, expected_yield_unit, notes, id);
        const updated = db.prepare('SELECT * FROM farm_seasons WHERE id = ?').get(id);
        res.json({ success: true, season: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update season' });
    }
});

router.delete('/seasons/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`SELECT fs.*, f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const season = checkStmt.get(id);
        if (!season) return res.status(404).json({ error: 'Season not found' });
        if (season.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM farm_seasons WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete season' });
    }
});

// ============================================
// FARM INPUTS (EXPENDITURES) - COMPLETE
// ============================================

const INPUT_CATEGORIES = [
    'seed', 'fertilizer', 'pesticide', 'herbicide', 'labour', 
    'machinery', 'transport', 'storage', 'irrigation', 'veterinary', 'other'
];

router.get('/seasons/:seasonId/inputs', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM farm_inputs WHERE season_id = ? ORDER BY purchase_date DESC, created_at DESC`);
        const inputs = stmt.all(seasonId);
        res.json({ inputs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inputs' });
    }
});

router.post('/seasons/:seasonId/inputs', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const { input_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message } = req.body;
        
        if (!input_type || total_cost === undefined) {
            return res.status(400).json({ error: 'Input type and total cost are required' });
        }
        
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            INSERT INTO farm_inputs (season_id, input_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertResult = stmt.run(seasonId, input_type, category || 'other', description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, raw_message);
        const input = db.prepare('SELECT * FROM farm_inputs WHERE id = ?').get(insertResult.lastInsertRowid);
        res.status(201).json({ success: true, input });
    } catch (error) {
        console.error('Add input error:', error);
        res.status(500).json({ error: 'Failed to add input' });
    }
});

// Parse SMS and auto-log farm input
router.post('/auto-log-input', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { message, season_id, category } = req.body;
        
        if (!message) return res.status(400).json({ error: 'SMS message is required' });
        if (!season_id) return res.status(400).json({ error: 'Season ID is required' });
        
        // Verify season ownership
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(season_id);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        // Parse SMS
        const parsed = parseAgricultureSMS(message);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Failed to parse SMS: ' + (parsed.error || 'Unknown error') });
        }
        
        // Determine input category from SMS
        let inputCategory = category || parsed.input_type || 'other';
        
        // Insert as farm input
        const stmt = db.prepare(`
            INSERT INTO farm_inputs (season_id, input_type, category, description, total_cost, purchase_date, supplier, raw_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const description = parsed.counterparty || parsed.input_type;
        const insertResult = stmt.run(
            season_id,
            inputCategory,
            inputCategory,
            description,
            parsed.amount || 0,
            parsed.transaction_date || new Date().toISOString(),
            parsed.counterparty || null,
            message
        );
        
        const input = db.prepare('SELECT * FROM farm_inputs WHERE id = ?').get(insertResult.lastInsertRowid);
        
        res.status(201).json({
            success: true,
            auto_logged: true,
            input_type: inputCategory,
            transaction: parsed,
            input: input,
            message: `✅ Auto-logged ${inputCategory} purchase: KSh ${(parsed.amount || 0).toFixed(2)}`
        });
    } catch (error) {
        console.error('Auto-log error:', error);
        res.status(500).json({ error: 'Failed to auto-log agriculture input' });
    }
});

router.put('/inputs/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { input_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number } = req.body;
        
        const checkStmt = db.prepare(`
            SELECT fi.*, f.user_id FROM farm_inputs fi
            JOIN farm_seasons fs ON fi.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fi.id = ?
        `);
        const input = checkStmt.get(id);
        if (!input) return res.status(404).json({ error: 'Input not found' });
        if (input.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            UPDATE farm_inputs 
            SET input_type = COALESCE(?, input_type),
                category = COALESCE(?, category),
                description = COALESCE(?, description),
                quantity = COALESCE(?, quantity),
                unit = COALESCE(?, unit),
                unit_cost = COALESCE(?, unit_cost),
                total_cost = COALESCE(?, total_cost),
                supplier = COALESCE(?, supplier),
                purchase_date = COALESCE(?, purchase_date),
                payment_method = COALESCE(?, payment_method),
                reference_number = COALESCE(?, reference_number)
            WHERE id = ?
        `);
        
        stmt.run(input_type, category, description, quantity, unit, unit_cost, total_cost, supplier, purchase_date, payment_method, reference_number, id);
        const updated = db.prepare('SELECT * FROM farm_inputs WHERE id = ?').get(id);
        res.json({ success: true, input: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update input' });
    }
});

router.delete('/inputs/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`
            SELECT fi.*, f.user_id FROM farm_inputs fi
            JOIN farm_seasons fs ON fi.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fi.id = ?
        `);
        const input = checkStmt.get(id);
        if (!input) return res.status(404).json({ error: 'Input not found' });
        if (input.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM farm_inputs WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete input' });
    }
});

// ============================================
// FARM OUTPUTS - COMPLETE
// ============================================

const OUTPUT_CATEGORIES = ['harvest', 'sale', 'byproduct'];

router.get('/seasons/:seasonId/outputs', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM farm_outputs WHERE season_id = ? ORDER BY sale_date DESC, created_at DESC`);
        const outputs = stmt.all(seasonId);
        res.json({ outputs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch outputs' });
    }
});

router.post('/seasons/:seasonId/outputs', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const { output_type, category, description, quantity, unit, unit_price, total_value, buyer, sale_date, payment_method, reference_number, raw_message } = req.body;
        
        if (!output_type || quantity === undefined || total_value === undefined) {
            return res.status(400).json({ error: 'Output type, quantity, and total value are required' });
        }
        
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            INSERT INTO farm_outputs (season_id, output_type, category, description, quantity, unit, unit_price, total_value, buyer, sale_date, payment_method, reference_number, raw_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertResult = stmt.run(seasonId, output_type, category || 'harvest', description, quantity, unit || 'kg', unit_price, total_value, buyer, sale_date, payment_method, reference_number, raw_message);
        const output = db.prepare('SELECT * FROM farm_outputs WHERE id = ?').get(insertResult.lastInsertRowid);
        res.status(201).json({ success: true, output });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add output' });
    }
});

router.put('/outputs/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { output_type, category, description, quantity, unit, unit_price, total_value, buyer, sale_date, payment_method, reference_number } = req.body;
        
        const checkStmt = db.prepare(`
            SELECT fo.*, f.user_id FROM farm_outputs fo
            JOIN farm_seasons fs ON fo.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fo.id = ?
        `);
        const output = checkStmt.get(id);
        if (!output) return res.status(404).json({ error: 'Output not found' });
        if (output.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const stmt = db.prepare(`
            UPDATE farm_outputs 
            SET output_type = COALESCE(?, output_type),
                category = COALESCE(?, category),
                description = COALESCE(?, description),
                quantity = COALESCE(?, quantity),
                unit = COALESCE(?, unit),
                unit_price = COALESCE(?, unit_price),
                total_value = COALESCE(?, total_value),
                buyer = COALESCE(?, buyer),
                sale_date = COALESCE(?, sale_date),
                payment_method = COALESCE(?, payment_method),
                reference_number = COALESCE(?, reference_number)
            WHERE id = ?
        `);
        
        stmt.run(output_type, category, description, quantity, unit, unit_price, total_value, buyer, sale_date, payment_method, reference_number, id);
        const updated = db.prepare('SELECT * FROM farm_outputs WHERE id = ?').get(id);
        res.json({ success: true, output: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update output' });
    }
});

router.delete('/outputs/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`
            SELECT fo.*, f.user_id FROM farm_outputs fo
            JOIN farm_seasons fs ON fo.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fo.id = ?
        `);
        const output = checkStmt.get(id);
        if (!output) return res.status(404).json({ error: 'Output not found' });
        if (output.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM farm_outputs WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete output' });
    }
});

// ============================================
// FARM LABOUR - NEW
// ============================================

router.get('/seasons/:seasonId/labour', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare(`SELECT * FROM farm_labour WHERE season_id = ? ORDER BY work_date DESC, created_at DESC`);
        const labour = stmt.all(seasonId);
        res.json({ labour });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch labour records' });
    }
});

router.post('/seasons/:seasonId/labour', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        const { worker_name, worker_phone, task_type, description, wage_type, days_worked, daily_wage, total_wage, work_date, payment_status, payment_date, notes } = req.body;
        
        if (!worker_name || !task_type || days_worked === undefined || daily_wage === undefined) {
            return res.status(400).json({ error: 'Worker name, task type, days worked, and daily wage are required' });
        }
        
        const checkStmt = db.prepare(`SELECT f.user_id FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const result = checkStmt.get(seasonId);
        if (!result) return res.status(404).json({ error: 'Season not found' });
        if (result.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const total = total_wage || (days_worked * daily_wage);
        const validWageTypes = ['daily', 'weekly', 'monthly'];
        const normalizedWageType = validWageTypes.includes(wage_type) ? wage_type : 'daily';
        
        const stmt = db.prepare(`
            INSERT INTO farm_labour (season_id, worker_name, worker_phone, task_type, description, wage_type, days_worked, daily_wage, total_wage, work_date, payment_status, payment_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertResult = stmt.run(seasonId, worker_name, worker_phone, task_type, description, normalizedWageType, days_worked, daily_wage, total, work_date, payment_status || 'pending', payment_date, notes);
        const labour = db.prepare('SELECT * FROM farm_labour WHERE id = ?').get(insertResult.lastInsertRowid);
        res.status(201).json({ success: true, labour });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add labour record' });
    }
});

router.put('/labour/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const { worker_name, worker_phone, task_type, description, wage_type, days_worked, daily_wage, total_wage, work_date, payment_status, payment_date, notes } = req.body;
        
        const checkStmt = db.prepare(`
            SELECT fl.*, f.user_id FROM farm_labour fl
            JOIN farm_seasons fs ON fl.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fl.id = ?
        `);
        const labour = checkStmt.get(id);
        if (!labour) return res.status(404).json({ error: 'Labour record not found' });
        if (labour.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        const total = total_wage || (days_worked * daily_wage);
        const validWageTypes = ['daily', 'weekly', 'monthly'];
        const normalizedWageType = validWageTypes.includes(wage_type) ? wage_type : undefined;
        
        const stmt = db.prepare(`
            UPDATE farm_labour 
            SET worker_name = COALESCE(?, worker_name),
                worker_phone = COALESCE(?, worker_phone),
                task_type = COALESCE(?, task_type),
                description = COALESCE(?, description),
                wage_type = COALESCE(?, wage_type),
                days_worked = COALESCE(?, days_worked),
                daily_wage = COALESCE(?, daily_wage),
                total_wage = COALESCE(?, total_wage),
                work_date = COALESCE(?, work_date),
                payment_status = COALESCE(?, payment_status),
                payment_date = COALESCE(?, payment_date),
                notes = COALESCE(?, notes)
            WHERE id = ?
        `);
        
        stmt.run(worker_name, worker_phone, task_type, description, normalizedWageType, days_worked, daily_wage, total, work_date, payment_status, payment_date, notes, id);
        const updated = db.prepare('SELECT * FROM farm_labour WHERE id = ?').get(id);
        res.json({ success: true, labour: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update labour record' });
    }
});

router.delete('/labour/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        const checkStmt = db.prepare(`
            SELECT fl.*, f.user_id FROM farm_labour fl
            JOIN farm_seasons fs ON fl.season_id = fs.id
            JOIN farms f ON fs.farm_id = f.id
            WHERE fl.id = ?
        `);
        const labour = checkStmt.get(id);
        if (!labour) return res.status(404).json({ error: 'Labour record not found' });
        if (labour.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        const stmt = db.prepare('DELETE FROM farm_labour WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete labour record' });
    }
});

// ============================================
// FARM PROFITABILITY (UPDATED with Labour)
// ============================================

router.get('/seasons/:seasonId/profitability', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { seasonId } = req.params;
        
        const checkStmt = db.prepare(`SELECT f.user_id, f.name as farm_name, fs.* FROM farm_seasons fs JOIN farms f ON fs.farm_id = f.id WHERE fs.id = ?`);
        const season = checkStmt.get(seasonId);
        if (!season) return res.status(404).json({ error: 'Season not found' });
        if (season.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
        
        // Get all inputs
        const inputStmt = db.prepare(`SELECT * FROM farm_inputs WHERE season_id = ?`);
        const inputs = inputStmt.all(seasonId);
        
        // Get all outputs
        const outputStmt = db.prepare(`SELECT * FROM farm_outputs WHERE season_id = ?`);
        const outputs = outputStmt.all(seasonId);
        
        // Get all labour
        const labourStmt = db.prepare(`SELECT * FROM farm_labour WHERE season_id = ?`);
        const labour = labourStmt.all(seasonId);
        
        // Calculate totals
        const totalInputCost = inputs.reduce((sum, i) => sum + i.total_cost, 0);
        const totalLabourCost = labour.reduce((sum, l) => sum + l.total_wage, 0);
        const totalCost = totalInputCost + totalLabourCost;
        const totalRevenue = outputs.reduce((sum, o) => sum + o.total_value, 0);
        const grossProfit = totalRevenue - totalCost;
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const roi = totalCost > 0 ? (grossProfit / totalCost) * 100 : 0;
        
        // Break-even calculation
        let breakEvenPoint = null;
        if (outputs.length > 0 && totalCost > 0) {
            const avgPrice = outputs.reduce((sum, o) => sum + (o.unit_price || 0), 0) / outputs.length;
            if (avgPrice > 0) {
                breakEvenPoint = totalCost / avgPrice;
            }
        }
        
        // Group inputs by category
        const inputsByCategory = inputs.reduce((acc, i) => {
            const category = i.category || 'other';
            if (!acc[category]) acc[category] = { total: 0, count: 0, items: [] };
            acc[category].total += i.total_cost;
            acc[category].count += 1;
            acc[category].items.push(i);
            return acc;
        }, {});
        
        // Group outputs by category
        const outputsByCategory = outputs.reduce((acc, o) => {
            const category = o.category || 'harvest';
            if (!acc[category]) acc[category] = { total: 0, count: 0, items: [] };
            acc[category].total += o.total_value;
            acc[category].count += 1;
            acc[category].items.push(o);
            return acc;
        }, {});
        
        res.json({
            profitability: {
                season: {
                    id: season.id,
                    name: season.name,
                    farm_name: season.farm_name,
                    crop_type: season.crop_type,
                    start_date: season.start_date,
                    end_date: season.end_date
                },
                summary: {
                    total_input_cost: totalInputCost,
                    total_labour_cost: totalLabourCost,
                    total_cost: totalCost,
                    total_revenue: totalRevenue,
                    gross_profit: grossProfit,
                    profit_margin: profitMargin,
                    roi: roi,
                    input_count: inputs.length,
                    output_count: outputs.length,
                    labour_count: labour.length
                },
                break_even: breakEvenPoint ? {
                    quantity: breakEvenPoint,
                    unit: 'kg'
                } : null,
                inputs_by_category: inputsByCategory,
                outputs_by_category: outputsByCategory,
                inputs: inputs,
                outputs: outputs,
                labour: labour
            }
        });
    } catch (error) {
        console.error('Profitability error:', error);
        res.status(500).json({ error: 'Failed to calculate profitability' });
    }
});

module.exports = router;