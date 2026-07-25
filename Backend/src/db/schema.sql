-- ============================================
-- PESA MIND - COMPLETE DATABASE SCHEMA v3.0
-- All 4 Modules with Full Cost/Output Tracking
-- ============================================

-- ============================================
-- 1. CORE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT,
    location TEXT,
    google_drive_token TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. PERSONAL FINANCE MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    is_default INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_category_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, keyword)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    counterparty TEXT,
    category TEXT,
    description TEXT,
    raw_message TEXT,
    transaction_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 3. BUSINESS MODULE (UPDATED)
-- ============================================

CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT,
    registration_number TEXT,
    location TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    counterparty TEXT,
    category TEXT,
    description TEXT,
    raw_message TEXT,
    transaction_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- ============================================
-- 4. AGRICULTURE MODULE (UPDATED - FULL COST TRACKING)
-- ============================================

CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    size REAL,
    size_unit TEXT DEFAULT 'acres',
    crop_type TEXT,
    soil_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS farm_seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    season_type TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    crop_type TEXT,
    expected_yield REAL,
    expected_yield_unit TEXT DEFAULT 'kg',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- FARM INPUTS (EXPENDITURES) - COMPLETE
CREATE TABLE IF NOT EXISTS farm_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    input_type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    quantity REAL,
    unit TEXT,
    unit_cost REAL,
    total_cost REAL NOT NULL,
    supplier TEXT,
    purchase_date TEXT,
    payment_method TEXT,
    reference_number TEXT,
    raw_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES farm_seasons(id) ON DELETE CASCADE
);

-- FARM OUTPUTS (HARVEST/SALES) - COMPLETE
CREATE TABLE IF NOT EXISTS farm_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    output_type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'kg',
    unit_price REAL,
    total_value REAL NOT NULL,
    buyer TEXT,
    sale_date TEXT,
    payment_method TEXT,
    reference_number TEXT,
    raw_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES farm_seasons(id) ON DELETE CASCADE
);

-- LABOUR TRACKING (NEW)
CREATE TABLE IF NOT EXISTS farm_labour (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    worker_name TEXT NOT NULL,
    worker_phone TEXT,
    task_type TEXT NOT NULL,
    description TEXT,
    wage_type TEXT NOT NULL DEFAULT 'daily',
    days_worked REAL NOT NULL,
    daily_wage REAL NOT NULL,
    total_wage REAL NOT NULL,
    work_date TEXT NOT NULL,
    payment_status TEXT DEFAULT 'pending',
    payment_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES farm_seasons(id) ON DELETE CASCADE
);

-- ============================================
-- 5. DAIRY MODULE (UPDATED - FULL COST TRACKING)
-- ============================================

CREATE TABLE IF NOT EXISTS animals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tag_id TEXT UNIQUE NOT NULL,
    name TEXT,
    breed TEXT,
    gender TEXT,
    birth_date TEXT,
    status TEXT DEFAULT 'active',
    purchase_date TEXT,
    purchase_price REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- DAILY MILK PRODUCTION
CREATE TABLE IF NOT EXISTS milk_production (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    morning_yield REAL,
    evening_yield REAL,
    total_yield REAL NOT NULL,
    fat_content REAL,
    protein_content REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- FEED COSTS (NEW - DETAILED)
CREATE TABLE IF NOT EXISTS feed_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER,
    feed_type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    quantity REAL,
    unit TEXT,
    unit_cost REAL,
    total_cost REAL NOT NULL,
    supplier TEXT,
    purchase_date TEXT,
    payment_method TEXT,
    reference_number TEXT,
    raw_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- VETERINARY RECORDS
CREATE TABLE IF NOT EXISTS veterinary_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    visit_date TEXT NOT NULL,
    diagnosis TEXT,
    treatment TEXT,
    medications TEXT,
    cost REAL,
    vet_name TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- ACARICIDES / TICK CONTROL (NEW)
CREATE TABLE IF NOT EXISTS acaricide_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER,
    application_date TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    unit_cost REAL,
    total_cost REAL NOT NULL,
    application_method TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- MILK SALES
CREATE TABLE IF NOT EXISTS milk_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sale_date TEXT NOT NULL,
    quantity_liters REAL NOT NULL,
    price_per_liter REAL NOT NULL,
    total_revenue REAL NOT NULL,
    buyer_name TEXT,
    buyer_phone TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'completed',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 6. GOOGLE DRIVE BACKUP (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS google_drive_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    backup_name TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_size INTEGER,
    backup_type TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 7. REPORTS (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS generated_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    module TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 6. SUBSCRIPTION, ACTIVATION & DEVICE MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price_monthly REAL DEFAULT 0,
    price_yearly REAL DEFAULT 0,
    max_users INTEGER DEFAULT 1,
    max_businesses INTEGER DEFAULT 1,
    max_farms INTEGER DEFAULT 1,
    max_animals INTEGER DEFAULT 5,
    features TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    activation_key TEXT,
    status TEXT DEFAULT 'active',
    start_date TEXT DEFAULT CURRENT_TIMESTAMP,
    end_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE TABLE IF NOT EXISTS activation_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code TEXT UNIQUE NOT NULL,
    plan_id INTEGER NOT NULL,
    created_by INTEGER,
    assigned_to INTEGER,
    device_id TEXT,
    status TEXT DEFAULT 'unused',
    max_activations INTEGER DEFAULT 1,
    activation_count INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT UNIQUE NOT NULL,
    device_name TEXT,
    device_type TEXT,
    is_active INTEGER DEFAULT 1,
    last_active TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    shared_with_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    permission TEXT DEFAULT 'view',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (owner_id, shared_with_id, module, entity_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    module TEXT,
    entity_id INTEGER,
    details TEXT,
    status TEXT DEFAULT 'success',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_business_tx_business_date ON business_transactions(business_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_farm_inputs_season ON farm_inputs(season_id);
CREATE INDEX IF NOT EXISTS idx_farm_outputs_season ON farm_outputs(season_id);
CREATE INDEX IF NOT EXISTS idx_farm_labour_season ON farm_labour(season_id);
CREATE INDEX IF NOT EXISTS idx_milk_production_animal_date ON milk_production(animal_id, date);
CREATE INDEX IF NOT EXISTS idx_feed_costs_animal ON feed_costs(animal_id);
CREATE INDEX IF NOT EXISTS idx_google_drive_backups_user ON google_drive_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_shared_with ON shared_access(shared_with_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at);

-- ============================================
-- DEFAULT SUBSCRIPTION PLANS
-- ============================================

INSERT OR IGNORE INTO subscription_plans (code, name, price_monthly, price_yearly, max_users, max_businesses, max_farms, max_animals, features, is_active) VALUES
('free', 'Free', 0, 0, 1, 1, 1, 5, '["expenditure_tracking","output_tracking","labour_tracking","business_finance","agriculture","dairy","ai_insights"]', 1),
('pro', 'Pro', 500, 5000, 1, 3, 3, 30, '["expenditure_tracking","output_tracking","labour_tracking","business_finance","agriculture","dairy","ai_insights","google_drive_backup","advanced_reports"]', 1),
('business', 'Business', 1500, 15000, 5, 10, 10, 200, '["expenditure_tracking","output_tracking","labour_tracking","business_finance","agriculture","dairy","ai_insights","google_drive_backup","advanced_reports","team_sharing","device_management"]', 1);

-- ============================================
-- DEFAULT CATEGORIES
-- ============================================

INSERT OR IGNORE INTO categories (keyword, category, is_default) VALUES
('NAIVAS', 'Groceries', 1), ('TUSKYS', 'Groceries', 1), ('QUICKMART', 'Groceries', 1),
('CARREFOUR', 'Groceries', 1), ('KPLC', 'Utilities', 1), ('WATER', 'Utilities', 1),
('SAFARICOM', 'Airtime', 1), ('TELKOM', 'Airtime', 1), ('AIRTEL', 'Airtime', 1),
('UBER', 'Transport', 1), ('BOLT', 'Transport', 1), ('FUEL', 'Transport', 1),
('RENT', 'Housing', 1), ('MPESA', 'Transfer', 1), ('FULIZA', 'Loan', 1),
('KCB', 'Banking', 1), ('EQUITY', 'Banking', 1), ('CO-OP', 'Banking', 1),
('SALARY', 'Income', 1), ('PAYMENT', 'Income', 1), ('DEPOSIT', 'Income', 1),
('SEED', 'Seed', 1), ('FERTILIZER', 'Fertilizer', 1), ('PESTICIDE', 'Pesticide', 1),
('HERBICIDE', 'Herbicide', 1), ('LABOUR', 'Labour', 1), ('MACHINERY', 'Machinery', 1),
('TRANSPORT', 'Transport', 1), ('STORAGE', 'Storage', 1), ('IRRIGATION', 'Irrigation', 1),
('VETERINARY', 'Veterinary', 1), ('FEED', 'Feed', 1), ('ACARICIDE', 'Acaricide', 1);