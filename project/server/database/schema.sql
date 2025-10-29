-- Table Utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'USER' CHECK(role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER')),
    google_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table Fichiers
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    is_shared BOOLEAN DEFAULT 0,
    is_locked BOOLEAN DEFAULT 0,
    owner_id TEXT NOT NULL,
    sync_status TEXT DEFAULT 'PENDING' CHECK(sync_status IN ('PENDING', 'SYNCING', 'SYNCED', 'CONFLICT', 'ERROR')),
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- Table Versions de Fichiers
CREATE TABLE IF NOT EXISTS file_versions (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    storage_url TEXT NOT NULL,
    modified_by TEXT NOT NULL,
    change_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN DEFAULT 0,
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (modified_by) REFERENCES users(id)
);

-- Table Permissions
CREATE TABLE IF NOT EXISTS file_permissions (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    permission TEXT CHECK(permission IN ('READ', 'WRITE', 'DELETE', 'ADMIN')),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Table Devices (pour sync P2P)
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    device_type TEXT,
    ip_address TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Table Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    source_device_id TEXT NOT NULL,
    target_device_id TEXT,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (source_device_id) REFERENCES devices(id)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
