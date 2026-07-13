import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'packaging.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    height REAL NOT NULL,
    width REAL NOT NULL,
    length REAL NOT NULL,
    weight REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS packaging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'box',
    height REAL NOT NULL,
    width REAL NOT NULL,
    length REAL NOT NULL,
    max_weight REAL,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migrate: add packaging_weight if it doesn't exist yet
try {
  db.exec('ALTER TABLE packaging ADD COLUMN packaging_weight REAL');
} catch {
  // Column already exists — safe to ignore
}

// Migrate: add foldable flag to products
try {
  db.exec('ALTER TABLE products ADD COLUMN foldable INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — safe to ignore
}

// Migrate: add ships_in_own_packaging flag to products
try {
  db.exec('ALTER TABLE products ADD COLUMN ships_in_own_packaging INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — safe to ignore
}

// Migrate: add max_height to packaging (for mailer thickness constraint)
try {
  db.exec('ALTER TABLE packaging ADD COLUMN max_height REAL');
} catch {
  // Column already exists — safe to ignore
}

// Ensure name is unique so the bulk import upsert can use ON CONFLICT(name)
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_name ON packaging(name)');

// Shipping methods (each is a discrete service with a weight range)
db.exec(`
  CREATE TABLE IF NOT EXISTS shipping_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    min_weight REAL NOT NULL DEFAULT 0,
    max_weight REAL,
    dim_divisor REAL,
    dim_threshold REAL,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate: add min_weight / max_weight if upgrading from the rates-based schema
try { db.exec('ALTER TABLE shipping_methods ADD COLUMN min_weight REAL NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE shipping_methods ADD COLUMN max_weight REAL'); } catch {}

// Migrate: add upc to products (optional barcode for desktop scanner lookup)
try {
  db.exec('ALTER TABLE products ADD COLUMN upc TEXT');
} catch {
  // Column already exists — safe to ignore
}

// Migrate: mark LTL freight methods so DIM is never applied to them
try {
  db.exec('ALTER TABLE shipping_methods ADD COLUMN is_ltl INTEGER NOT NULL DEFAULT 0');
} catch {
  // Column already exists — safe to ignore
}

// Per-method rate cards: single zone, by-weight breaks ("up to max_weight lbs → rate")
db.exec(`
  CREATE TABLE IF NOT EXISTS shipping_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method_id INTEGER NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
    max_weight REAL NOT NULL,
    rate REAL NOT NULL,
    UNIQUE(method_id, max_weight)
  );
`);

// Report cache table — stores pre-computed analysis results
db.exec(`
  CREATE TABLE IF NOT EXISTS report_cache (
    type TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT,
    error TEXT,
    computed_at TEXT,
    started_at TEXT
  );
`);

// User accounts, per-module privileges, persistent sessions, and one-time auth tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    salsify_api_key TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_privileges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('none','view','edit')),
    PRIMARY KEY (user_id, module)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
`);

// Seed default settings
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
insertSetting.run('dim_divisor', '139');
insertSetting.run('pack_efficiency', '0.70');
insertSetting.run('weight_unit', 'lbs');
insertSetting.run('dim_unit', 'in');
insertSetting.run('ltl_threshold', '150');
insertSetting.run('fit_clearance', '0.5');

export default db;
