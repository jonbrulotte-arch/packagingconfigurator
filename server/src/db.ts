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

// Migrate: add max_height to packaging (for mailer thickness constraint)
try {
  db.exec('ALTER TABLE packaging ADD COLUMN max_height REAL');
} catch {
  // Column already exists — safe to ignore
}

// Seed default settings
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
insertSetting.run('dim_divisor', '139');
insertSetting.run('pack_efficiency', '0.70');
insertSetting.run('weight_unit', 'lbs');
insertSetting.run('dim_unit', 'in');

export default db;
