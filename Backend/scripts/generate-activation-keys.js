const { getDb, initializeDatabase } = require('../src/db');
const { generateSecureActivationKey } = require('../src/utils/activation');

function generateActivationKeys() {
    console.log('🔑 Generating Activation Keys...');
    console.log('========================================');
    
    initializeDatabase();
    const db = getDb();
    
    // Get plans
    const plans = db.prepare('SELECT id, name, code FROM subscription_plans WHERE is_active = 1').all();
    
    console.log('\n📋 Available Plans:');
    plans.forEach((plan, index) => {
        console.log(`   ${index + 1}. ${plan.name} (${plan.code})`);
    });
    
    // Ask which plan to generate keys for
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    readline.question('\n📝 Enter plan number (or "all" for all plans): ', (planInput) => {
        readline.question('📝 Number of keys to generate: ', (countInput) => {
            const count = parseInt(countInput) || 1;
            const isAll = planInput.toLowerCase() === 'all';
            
            let selectedPlans = [];
            
            if (isAll) {
                selectedPlans = plans;
            } else {
                const planIndex = parseInt(planInput) - 1;
                if (planIndex >= 0 && planIndex < plans.length) {
                    selectedPlans = [plans[planIndex]];
                } else {
                    console.log('❌ Invalid plan selection');
                    readline.close();
                    return;
                }
            }
            
            const allKeys = [];
            
            selectedPlans.forEach((plan) => {
                const keys = [];
                const stmt = db.prepare(`
                    INSERT INTO activation_keys (key_code, plan_id, created_by, expires_at, max_activations)
                    VALUES (?, ?, ?, datetime('now', '+365 days'), 1)
                `);
                
                for (let i = 0; i < count; i++) {
                    const keyCode = generateSecureActivationKey();
                    stmt.run(keyCode, plan.id, 1); // 1 = admin user
                    keys.push(keyCode);
                }
                
                allKeys.push({ plan: plan.name, keys });
                console.log(`\n✅ Generated ${keys.length} keys for ${plan.name}:`);
                keys.forEach(key => console.log(`   ${key}`));
            });
            
            // Save to file
            const fs = require('fs');
            const output = {
                generated_at: new Date().toISOString(),
                total_keys: allKeys.reduce((sum, p) => sum + p.keys.length, 0),
                keys_by_plan: allKeys
            };
            
            const filename = `activation_keys_${Date.now()}.json`;
            fs.writeFileSync(filename, JSON.stringify(output, null, 2));
            console.log(`\n📁 Keys saved to: ${filename}`);
            
            readline.close();
        });
    });
}

generateActivationKeys();