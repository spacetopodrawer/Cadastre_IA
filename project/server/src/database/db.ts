import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(__dirname, '../../database.sqlite');

export const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');

export function initDatabase() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  console.log('✅ Database initialized');
}

// Ensure schema exists before preparing statements
initDatabase();

export const prepared = {
  createUser: db.prepare(`
    INSERT INTO users (id, email, password, name, role, google_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getUserByEmail: db.prepare(`
    SELECT * FROM users WHERE email = ?
  `),
  getUserById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),
  updateUserRole: db.prepare(`
    UPDATE users SET role = ? WHERE id = ?
  `),

  createFile: db.prepare(`
    INSERT INTO files (id, name, original_name, path, size, mime_type, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getFilesByOwner: db.prepare(`
    SELECT * FROM files WHERE owner_id = ? ORDER BY updated_at DESC
  `),
  getFileById: db.prepare(`
    SELECT * FROM files WHERE id = ?
  `),
  updateFileSyncStatus: db.prepare(`
    UPDATE files SET sync_status = ?, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?
  `),

  createFileVersion: db.prepare(`
    INSERT INTO file_versions (id, file_id, version_number, storage_url, modified_by, change_log)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getFileVersions: db.prepare(`
    SELECT * FROM file_versions WHERE file_id = ? ORDER BY version_number DESC
  `),

  registerDevice: db.prepare(`
    INSERT INTO devices (id, user_id, device_name, device_type, ip_address)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, is_online = 1
  `),
  updateDeviceStatus: db.prepare(`
    UPDATE devices SET is_online = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?
  `),
  getOnlineDevices: db.prepare(`
    SELECT * FROM devices WHERE is_online = 1 AND user_id = ?
  `),

  addToSyncQueue: db.prepare(`
    INSERT INTO sync_queue (id, file_id, source_device_id, target_device_id)
    VALUES (?, ?, ?, ?)
  `),
  getPendingSyncs: db.prepare(`
    SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC
  `)
};

export default db;
