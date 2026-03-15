const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const dbPath = path.join(__dirname, 'data', 'students.db');
const jsonSeedPath = path.join(__dirname, 'data', 'students.json');

let database;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      course TEXT NOT NULL,
      rut TEXT NOT NULL,
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_codes (
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_login_codes_email
    ON login_codes(email, created_at DESC);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_email
    ON auth_sessions(email);
  `);
}

async function seedFromJsonIfNeeded(db) {
  const row = await db.get('SELECT COUNT(*) AS total FROM students');
  if (row && row.total > 0) {
    return;
  }

  try {
    const raw = await fs.readFile(jsonSeedPath, 'utf8');
    const students = JSON.parse(raw);
    const now = Date.now();

    await db.exec('BEGIN');
    for (const item of students) {
      const email = normalizeEmail(item.email);
      if (!email) {
        continue;
      }

      await db.run(
        `
          INSERT INTO students (email, name, course, rut, photo_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          email,
          String(item.name || '').trim(),
          String(item.course || '').trim(),
          String(item.rut || '').trim(),
          String(item.photoUrl || '').trim(),
          now,
          now
        ]
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function initDatabase() {
  if (database) {
    return database;
  }

  database = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await ensureSchema(database);
  await seedFromJsonIfNeeded(database);

  return database;
}

module.exports = {
  initDatabase,
  normalizeEmail
};
