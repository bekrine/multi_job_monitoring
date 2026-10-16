-- Migration 0001: Initial schema for Morocco IT Job Monitoring Multi-User Telegram Service
-- Optimized for Cloudflare D1 (SQLite)

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_chat_id TEXT UNIQUE NOT NULL,
    telegram_user_id TEXT,
    username TEXT,
    first_name TEXT,
    language TEXT NOT NULL DEFAULT 'fr', -- 'fr' or 'ar'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'deleted'
    onboarding_status TEXT NOT NULL DEFAULT 'new', -- 'new', 'in_progress', 'completed'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. User Preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    specialties TEXT NOT NULL DEFAULT '["info_gen"]', -- JSON array of stable identifiers
    grades TEXT NOT NULL DEFAULT '["all"]',           -- JSON array of stable identifiers
    custom_grade TEXT,
    locations TEXT NOT NULL DEFAULT '["all"]',        -- JSON array, e.g. ["all"] or ["Casablanca", "Rabat"]
    custom_location TEXT,
    sector TEXT NOT NULL DEFAULT 'both',              -- 'public', 'private', 'both'
    contract_type TEXT DEFAULT 'all',                 -- 'all', 'cdi', 'cdd', 'fonction_publique'
    experience_level TEXT DEFAULT 'all',              -- 'all', 'junior', 'mid', 'senior'
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Conversation State (for multi-step onboarding and interactive flows, isolated per chat)
CREATE TABLE IF NOT EXISTS user_conversations (
    chat_id TEXT PRIMARY KEY,
    step TEXT NOT NULL,                               -- Current onboarding / edit step
    data TEXT NOT NULL DEFAULT '{}',                  -- JSON containing temporary state
    updated_at TEXT NOT NULL
);

-- 4. Job Announcements table (canonical storage for discovered IT opportunities)
CREATE TABLE IF NOT EXISTS job_announcements (
    id TEXT PRIMARY KEY,                              -- Stable deterministic hash or portal ID
    source TEXT NOT NULL,                             -- 'emploi-public.ma', 'custom', 'demo'
    source_id TEXT,
    title TEXT NOT NULL,
    employer TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    url TEXT NOT NULL,
    grade TEXT,
    specialite TEXT,
    deadline TEXT,
    published_date TEXT,
    raw_text TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_published ON job_announcements(published_date);
CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON job_announcements(first_seen_at);

-- 5. Notifications table (idempotency: prevents notifying the same user twice for the same job)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    announcement_id TEXT NOT NULL,
    digest_date TEXT NOT NULL,                        -- YYYY-MM-DD
    delivery_status TEXT NOT NULL,                    -- 'sent', 'failed', 'skipped'
    attempt_count INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES job_announcements(id) ON DELETE CASCADE,
    UNIQUE(user_id, announcement_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_digest_date ON notifications(digest_date);

-- 6. Rate limiting table (for manual searches and webhook requests)
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,                             -- e.g. "search:chat_id"
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL                     -- timestamp in ms
);
