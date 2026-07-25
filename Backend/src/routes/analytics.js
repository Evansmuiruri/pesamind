const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// ============================================
// SPENDING TRENDS
// ============================================

router.get('/spending-trends', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { period = 'month', module = 'personal' } = req.query;
        
        let tableName;
        let foreignKey;
        
        switch(module) {
            case 'business':
                tableName = 'business_transactions';
                foreignKey = 'business_id';
                break;
            case 'agriculture':
                tableName = 'farm_inputs';
                foreignKey = 'season_id';
                break;
            case 'dairy':
                tableName = 'feed_costs';
                foreignKey = 'animal_id';
                break;
            default:
                tableName = 'transactions';
                foreignKey = 'user_id';
        }
        
        let query;
        let params = [userId];
        
        if (module === 'agriculture') {
            query = `
                SELECT 
                    DATE(purchase_date) as date,
                    SUM(total_cost) as total,
                    COUNT(*) as count,
                    GROUP_CONCAT(DISTINCT input_type) as types
                FROM farm_inputs fi
                JOIN farm_seasons fs ON fi.season_id = fs.id
                JOIN farms f ON fs.farm_id = f.id
                WHERE f.user_id = ?
                AND purchase_date >= DATE('now', '-30 days')
                GROUP BY DATE(purchase_date)
                ORDER BY date ASC
            `;
        } else if (module === 'dairy') {
            query = `
                SELECT 
                    DATE(purchase_date) as date,
                    SUM(total_cost) as total,
                    COUNT(*) as count,
                    GROUP_CONCAT(DISTINCT feed_type) as types
                FROM feed_costs fc
                JOIN animals a ON fc.animal_id = a.id
                WHERE a.user_id = ?
                AND purchase_date >= DATE('now', '-30 days')
                GROUP BY DATE(purchase_date)
                ORDER BY date ASC
            `;
        } else {
            query = `
                SELECT 
                    DATE(transaction_date) as date,
                    SUM(CASE WHEN type IN ('expense', 'sent', 'airtime', 'till', 'withdraw') THEN amount ELSE 0 END) as total,
                    COUNT(*) as count,
                    GROUP_CONCAT(DISTINCT category) as categories
                FROM ${tableName}
                WHERE ${foreignKey} = ?
                AND transaction_date >= DATE('now', '-30 days')
                GROUP BY DATE(transaction_date)
                ORDER BY date ASC
            `;
        }
        
        const stmt = db.prepare(query);
        const dailyData = stmt.all(...params);
        
        const dataWithTrends = dailyData.map((day, index) => {
            const windowSize = 7;
            const start = Math.max(0, index - windowSize + 1);
            const window = dailyData.slice(start, index + 1);
            const avg = window.reduce((sum, d) => sum + (d.total || 0), 0) / window.length;
            
            return {
                ...day,
                rolling_avg: avg,
                trend: index > 0 ? (day.total - dailyData[index-1].total) / (dailyData[index-1].total || 1) * 100 : 0
            };
        });
        
        let categoryQuery;
        if (module === 'agriculture') {
            categoryQuery = `
                SELECT 
                    input_type as category,
                    SUM(total_cost) as total,
                    COUNT(*) as count
                FROM farm_inputs fi
                JOIN farm_seasons fs ON fi.season_id = fs.id
                JOIN farms f ON fs.farm_id = f.id
                WHERE f.user_id = ?
                AND purchase_date >= DATE('now', '-30 days')
                GROUP BY input_type
                ORDER BY total DESC
            `;
        } else if (module === 'dairy') {
            categoryQuery = `
                SELECT 
                    feed_type as category,
                    SUM(total_cost) as total,
                    COUNT(*) as count
                FROM feed_costs fc
                JOIN animals a ON fc.animal_id = a.id
                WHERE a.user_id = ?
                AND purchase_date >= DATE('now', '-30 days')
                GROUP BY feed_type
                ORDER BY total DESC
            `;
        } else {
            categoryQuery = `
                SELECT 
                    category,
                    SUM(amount) as total,
                    COUNT(*) as count
                FROM ${tableName}
                WHERE ${foreignKey} = ?
                AND transaction_date >= DATE('now', '-30 days')
                AND type IN ('expense', 'sent', 'airtime', 'till', 'withdraw')
                GROUP BY category
                ORDER BY total DESC
            `;
        }
        
        const catStmt = db.prepare(categoryQuery);
        const categoryData = catStmt.all(...params);
        
        const totalSpent = dataWithTrends.reduce((sum, d) => sum + (d.total || 0), 0);
        const avgDaily = dataWithTrends.length > 0 ? totalSpent / dataWithTrends.length : 0;
        const maxDaily = Math.max(...dataWithTrends.map(d => d.total || 0), 0);
        
        let forecast = [];
        if (dataWithTrends.length >= 7) {
            const last7Days = dataWithTrends.slice(-7);
            const avgLast7 = last7Days.reduce((sum, d) => sum + (d.total || 0), 0) / 7;
            const trend = (last7Days[last7Days.length-1].total - last7Days[0].total) / 7;
            
            for (let i = 1; i <= 7; i++) {
                forecast.push({
                    day: `Day +${i}`,
                    predicted: Math.max(0, avgLast7 + (trend * i))
                });
            }
        }
        
        res.json({
            module,
            period: '30_days',
            summary: {
                total_spent: totalSpent,
                average_daily: avgDaily,
                max_daily: maxDaily,
                days: dataWithTrends.length,
                categories: categoryData.length
            },
            daily: dataWithTrends,
            categories: categoryData,
            forecast: forecast
        });
        
    } catch (error) {
        console.error('Spending trends error:', error);
        res.status(500).json({ error: 'Failed to get spending trends' });
    }
});

// ============================================
// "WHAT IF" SIMULATION
// ============================================

router.post('/simulate', (req, res) => {
    try {
        const { current_spend, target_savings, category_to_reduce, reduction_percent, period = 'month' } = req.body;
        
        if (!current_spend || !target_savings || !category_to_reduce) {
            return res.status(400).json({ 
                error: 'current_spend, target_savings, and category_to_reduce are required' 
            });
        }
        
        const db = getDb();
        const userId = req.user.id;
        
        const stmt = db.prepare(`
            SELECT 
                SUM(amount) as total,
                COUNT(*) as count
            FROM transactions
            WHERE user_id = ?
            AND category = ?
            AND type IN ('expense', 'sent', 'airtime', 'till', 'withdraw')
            AND transaction_date >= DATE('now', '-30 days')
        `);
        
        const result = stmt.get(userId, category_to_reduce);
        const currentCategorySpend = result?.total || 0;
        
        const reductionAmount = currentCategorySpend * (reduction_percent / 100);
        const projectedCategorySpend = currentCategorySpend - reductionAmount;
        const projectedTotalSpend = current_spend - reductionAmount;
        const projectedSavings = (current_spend - projectedTotalSpend);
        const monthlySavings = projectedSavings;
        const annualSavings = monthlySavings * 12;
        
        const scenarios = [
            {
                name: 'Conservative',
                reduction: Math.min(5, reduction_percent),
                savings: currentCategorySpend * 0.05
            },
            {
                name: 'Moderate',
                reduction: Math.min(10, reduction_percent),
                savings: currentCategorySpend * 0.10
            },
            {
                name: 'Aggressive',
                reduction: Math.min(20, reduction_percent),
                savings: currentCategorySpend * 0.20
            }
        ];
        
        function generateRecommendations(current, projected, savings, target) {
            const recommendations = [];
            
            if (savings >= target) {
                recommendations.push('✅ Great news! Your projected savings meet your target.');
            } else {
                recommendations.push(`⚠️ You need to save an additional KSh ${(target - savings).toFixed(2)} per month to meet your target.`);
                recommendations.push('💡 Consider reducing spending in other categories or increasing the reduction percentage.');
            }
            
            if (projected < current * 0.8) {
                recommendations.push('🔍 Your projected spending is significantly lower than current. Review if this is realistic.');
            }
            
            if (savings > 0) {
                recommendations.push(`💰 Monthly savings of KSh ${savings.toFixed(2)} can be invested or saved for future goals.`);
            }
            
            return recommendations;
        }
        
        res.json({
            simulation: {
                current_spend: current_spend,
                target_savings: target_savings,
                category_to_reduce: category_to_reduce,
                current_category_spend: currentCategorySpend,
                reduction_percent: reduction_percent,
                projected_category_spend: projectedCategorySpend,
                projected_total_spend: projectedTotalSpend,
                monthly_savings: monthlySavings,
                annual_savings: annualSavings,
                target_achieved: monthlySavings >= target_savings,
                months_to_target: target_savings > 0 ? Math.ceil(target_savings / (monthlySavings || 1)) : 0
            },
            scenarios: scenarios,
            recommendations: generateRecommendations(
                current_spend,
                projectedTotalSpend,
                monthlySavings,
                target_savings
            )
        });
        
    } catch (error) {
        console.error('Simulation error:', error);
        res.status(500).json({ error: 'Failed to run simulation' });
    }
});

module.exports = router;