const express = require('express');
const { getDb } = require('../db');
const fs = require('fs');
const path = require('path');

// Note: In production, install:
// npm install pdfkit

// This is a placeholder implementation
// Full PDF generation would use pdfkit library

const router = express.Router();

// ============================================
// REPORT GENERATION
// ============================================

// Generate Profit/Loss Report
router.post('/profit-loss', async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { module, id, period } = req.body;
        
        if (!module || !id) {
            return res.status(400).json({ error: 'Module and ID are required' });
        }
        
        let data = {};
        let reportTitle = '';
        
        // Get data based on module
        switch(module) {
            case 'agriculture': {
                const stmt = db.prepare(`
                    SELECT f.name as farm_name, fs.*,
                           (SELECT SUM(total_cost) FROM farm_inputs WHERE season_id = fs.id) as total_input_cost,
                           (SELECT SUM(total_wage) FROM farm_labour WHERE season_id = fs.id) as total_labour_cost,
                           (SELECT SUM(total_value) FROM farm_outputs WHERE season_id = fs.id) as total_output_value
                    FROM farm_seasons fs
                    JOIN farms f ON fs.farm_id = f.id
                    WHERE fs.id = ? AND f.user_id = ?
                `);
                data = stmt.get(id, userId);
                reportTitle = `Farm Profit/Loss Report - ${data?.farm_name || ''}`;
                break;
            }
            case 'business': {
                const stmt = db.prepare(`
                    SELECT b.name as business_name, 
                           SUM(CASE WHEN type IN ('income', 'received', 'deposit') THEN amount ELSE 0 END) as total_income,
                           SUM(CASE WHEN type IN ('expense', 'sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as total_expenses
                    FROM business_transactions bt
                    JOIN businesses b ON bt.business_id = b.id
                    WHERE bt.business_id = ? AND b.user_id = ?
                `);
                data = stmt.get(id, userId);
                reportTitle = `Business Profit/Loss Report - ${data?.business_name || ''}`;
                break;
            }
            case 'dairy': {
                const stmt = db.prepare(`
                    SELECT a.name as animal_name, a.tag_id,
                           SUM(mp.total_yield) as total_milk,
                           SUM(ms.total_revenue) as milk_revenue,
                           SUM(fc.total_cost) as feed_cost,
                           SUM(vr.cost) as vet_cost,
                           SUM(ac.total_cost) as acaricide_cost
                    FROM animals a
                    LEFT JOIN milk_production mp ON a.id = mp.animal_id
                    LEFT JOIN milk_sales ms ON a.user_id = ms.user_id
                    LEFT JOIN feed_costs fc ON a.id = fc.animal_id
                    LEFT JOIN veterinary_records vr ON a.id = vr.animal_id
                    LEFT JOIN acaricide_records ac ON a.id = ac.animal_id
                    WHERE a.id = ? AND a.user_id = ?
                    GROUP BY a.id
                `);
                data = stmt.get(id, userId);
                reportTitle = `Dairy Profit/Loss Report - ${data?.animal_name || data?.tag_id || ''}`;
                break;
            }
            default:
                return res.status(400).json({ error: 'Invalid module' });
        }
        
        if (!data) {
            return res.status(404).json({ error: 'Data not found' });
        }
        
        // Generate PDF (placeholder)
        const fileName = `report_${module}_${id}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, '../../reports', fileName);
        
        // Ensure reports directory exists
        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        // In production, use pdfkit to generate PDF
        // For now, save data as JSON for testing
        fs.writeFileSync(filePath, JSON.stringify({ reportTitle, data, generated_at: new Date().toISOString() }, null, 2));
        
        // Save report record
        const stmt = db.prepare(`
            INSERT INTO generated_reports (user_id, report_type, module, file_name, file_path)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(userId, 'profit_loss', module, fileName, filePath);
        
        res.json({
            success: true,
            message: 'Report generated successfully',
            file_name: fileName,
            file_path: filePath,
            report_title: reportTitle
        });
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Generate Expenditure Report
router.post('/expenditure', async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { module, id, start_date, end_date } = req.body;
        
        if (!module || !id) {
            return res.status(400).json({ error: 'Module and ID are required' });
        }
        
        let data = {};
        let reportTitle = '';
        
        switch(module) {
            case 'agriculture': {
                const stmt = db.prepare(`
                    SELECT fi.* FROM farm_inputs fi
                    JOIN farm_seasons fs ON fi.season_id = fs.id
                    JOIN farms f ON fs.farm_id = f.id
                    WHERE fs.id = ? AND f.user_id = ?
                    ${start_date ? 'AND fi.purchase_date >= ?' : ''}
                    ${end_date ? 'AND fi.purchase_date <= ?' : ''}
                    ORDER BY fi.purchase_date DESC
                `);
                const params = [id, userId];
                if (start_date) params.push(start_date);
                if (end_date) params.push(end_date);
                data = stmt.all(...params);
                reportTitle = 'Farm Expenditure Report';
                break;
            }
            case 'business': {
                const stmt = db.prepare(`
                    SELECT * FROM business_transactions bt
                    JOIN businesses b ON bt.business_id = b.id
                    WHERE bt.business_id = ? AND b.user_id = ?
                    AND bt.type IN ('expense', 'sent', 'airtime', 'till', 'withdraw')
                    ${start_date ? 'AND bt.transaction_date >= ?' : ''}
                    ${end_date ? 'AND bt.transaction_date <= ?' : ''}
                    ORDER BY bt.transaction_date DESC
                `);
                const params = [id, userId];
                if (start_date) params.push(start_date);
                if (end_date) params.push(end_date);
                data = stmt.all(...params);
                reportTitle = 'Business Expenditure Report';
                break;
            }
            case 'dairy': {
                const stmt = db.prepare(`
                    SELECT 'feed' as type, fc.* FROM feed_costs fc
                    JOIN animals a ON fc.animal_id = a.id
                    WHERE a.id = ? AND a.user_id = ?
                    UNION ALL
                    SELECT 'vet' as type, vr.* FROM veterinary_records vr
                    JOIN animals a ON vr.animal_id = a.id
                    WHERE a.id = ? AND a.user_id = ?
                    UNION ALL
                    SELECT 'acaricide' as type, ac.* FROM acaricide_records ac
                    LEFT JOIN animals a ON ac.animal_id = a.id
                    WHERE (ac.animal_id = ? OR ac.animal_id IS NULL) AND a.user_id = ?
                    ORDER BY created_at DESC
                `);
                data = stmt.all(id, userId, id, userId, id, userId);
                reportTitle = 'Dairy Expenditure Report';
                break;
            }
            default:
                return res.status(400).json({ error: 'Invalid module' });
        }
        
        const fileName = `expenditure_${module}_${id}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, '../../reports', fileName);
        
        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
        
        fs.writeFileSync(filePath, JSON.stringify({ reportTitle, data, generated_at: new Date().toISOString() }, null, 2));
        
        const stmt = db.prepare(`
            INSERT INTO generated_reports (user_id, report_type, module, file_name, file_path)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(userId, 'expenditure', module, fileName, filePath);
        
        res.json({
            success: true,
            message: 'Expenditure report generated',
            file_name: fileName,
            file_path: filePath,
            report_title: reportTitle,
            record_count: data.length || 0
        });
    } catch (error) {
        console.error('Expenditure report error:', error);
        res.status(500).json({ error: 'Failed to generate expenditure report' });
    }
});

// Get generated reports
router.get('/reports', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare(`
            SELECT * FROM generated_reports 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `);
        const reports = stmt.all(userId);
        
        res.json({ reports });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Download report
router.get('/download/:id', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id } = req.params;
        
        const stmt = db.prepare('SELECT * FROM generated_reports WHERE id = ? AND user_id = ?');
        const report = stmt.get(id, userId);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        if (!fs.existsSync(report.file_path)) {
            return res.status(404).json({ error: 'Report file not found' });
        }
        
        // In production, send PDF file
        // For now, send JSON data
        const data = fs.readFileSync(report.file_path, 'utf8');
        res.json({
            success: true,
            report: report,
            data: JSON.parse(data)
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
});

module.exports = router;