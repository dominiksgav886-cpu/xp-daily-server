import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'xpdaily.db');

let db = null;

const promisifyDb = (database) => {
  return {
    run: (sql, params = []) => new Promise((resolve, reject) => {
      database.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
      database.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
      database.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    }),
    exec: (sql) => new Promise((resolve, reject) => {
      database.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }),
    close: () => new Promise((resolve, reject) => {
      database.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    })
  };
};

export async function initDatabase() {
  const rawDb = new sqlite3.Database(dbPath);
  db = promisifyDb(rawDb);
  rawDb.configure('busyTimeout', 5000);

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_time TEXT,
      xp_reward INTEGER DEFAULT 25,
      coin_reward INTEGER DEFAULT 10,
      is_completed BOOLEAN DEFAULT 0,
      completion_date TEXT,
      icon TEXT DEFAULT 'sword',
      difficulty TEXT DEFAULT 'medium',
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      xp_reward INTEGER DEFAULT 50,
      coin_reward INTEGER DEFAULT 25,
      is_completed BOOLEAN DEFAULT 0,
      completion_date TEXT,
      quest_type TEXT DEFAULT 'daily',
      difficulty TEXT DEFAULT 'medium',
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      category TEXT DEFAULT 'perk',
      icon TEXT DEFAULT 'gift',
      is_purchased BOOLEAN DEFAULT 0,
      rarity TEXT DEFAULT 'common',
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      is_unlocked BOOLEAN DEFAULT 0,
      unlock_date TEXT,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_quests_user ON quests(user_id);
    CREATE INDEX IF NOT EXISTS idx_shop_items_user ON shop_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
  `);

  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function closeDatabase() {
  if (db) {
    await db.close();
  }
}
