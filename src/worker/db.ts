/**
 * D1 database access layer for Morocco IT Job Monitoring service.
 * Handles users, preferences, isolated conversation state, job announcements,
 * notification tracking (idempotency), and rate limiting.
 */

import {
  UserRecord,
  UserPreferences,
  ConversationState,
  IngestJobPayload,
  StoredJobAnnouncement,
  Language,
  UserStatus,
  OnboardingStatus,
  SectorFilter,
  D1Database,
} from './types.ts';

export class DbService {
  constructor(private readonly db: D1Database) {}

  public async getUserByChatId(chatId: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE telegram_chat_id = ?')
      .bind(chatId)
      .first<UserRecord>();
    return row || null;
  }

  public async getOrCreateUser(data: {
    chatId: string;
    userId?: string | null;
    username?: string | null;
    firstName?: string | null;
    defaultLang?: Language;
  }): Promise<UserRecord> {
    const existing = await this.getUserByChatId(data.chatId);
    const now = new Date().toISOString();

    if (existing) {
      // Update metadata if changed
      await this.db
        .prepare(
          'UPDATE users SET username = ?, first_name = ?, updated_at = ? WHERE id = ?'
        )
        .bind(data.username || existing.username, data.firstName || existing.first_name, now, existing.id)
        .run();
      return {
        ...existing,
        username: data.username || existing.username,
        first_name: data.firstName || existing.first_name,
        updated_at: now,
      };
    }

    const lang: Language = data.defaultLang || 'fr';
    const insertRes = await this.db
      .prepare(
        `INSERT INTO users (telegram_chat_id, telegram_user_id, username, first_name, language, status, onboarding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'new', ?, ?)`
      )
      .bind(
        data.chatId,
        data.userId || null,
        data.username || null,
        data.firstName || null,
        lang,
        now,
        now
      )
      .run();

    const newId = insertRes.meta.last_row_id as number;

    // Default preferences
    await this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, specialties, grades, locations, sector, contract_type, experience_level, updated_at)
         VALUES (?, '["info_gen"]', '["all"]', '["all"]', 'both', 'all', 'all', ?)`
      )
      .bind(newId, now)
      .run();

    return {
      id: newId,
      telegram_chat_id: data.chatId,
      telegram_user_id: data.userId || null,
      username: data.username || null,
      first_name: data.firstName || null,
      language: lang,
      status: 'active',
      onboarding_status: 'new',
      created_at: now,
      updated_at: now,
    };
  }

  public async updateUserLanguage(chatId: string, language: Language): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET language = ?, updated_at = ? WHERE telegram_chat_id = ?')
      .bind(language, now, chatId)
      .run();
  }

  public async updateUserStatus(chatId: string, status: UserStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET status = ?, updated_at = ? WHERE telegram_chat_id = ?')
      .bind(status, now, chatId)
      .run();
  }

  public async updateOnboardingStatus(chatId: string, status: OnboardingStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET onboarding_status = ?, updated_at = ? WHERE telegram_chat_id = ?')
      .bind(status, now, chatId)
      .run();
  }

  public async getUserPreferences(userId: number): Promise<UserPreferences | null> {
    interface PrefsRow {
      user_id: number;
      specialties: string;
      grades: string;
      custom_grade?: string | null;
      locations: string;
      custom_location?: string | null;
      sector: SectorFilter;
      contract_type?: string | null;
      experience_level?: string | null;
      updated_at: string;
    }

    const row = await this.db
      .prepare('SELECT * FROM user_preferences WHERE user_id = ?')
      .bind(userId)
      .first<PrefsRow>();

    if (!row) return null;

    let specialties: string[] = ['info_gen'];
    let grades: string[] = ['all'];
    let locations: string[] = ['all'];

    try {
      specialties = JSON.parse(row.specialties);
    } catch {
      // fallback
    }
    try {
      grades = JSON.parse(row.grades);
    } catch {
      // fallback
    }
    try {
      locations = JSON.parse(row.locations);
    } catch {
      // fallback
    }

    return {
      user_id: row.user_id,
      specialties,
      grades,
      custom_grade: row.custom_grade,
      locations,
      custom_location: row.custom_location,
      sector: row.sector || 'both',
      contract_type: row.contract_type || 'all',
      experience_level: row.experience_level || 'all',
      updated_at: row.updated_at,
    };
  }

  public async saveUserPreferences(
    userId: number,
    prefs: {
      specialties?: string[];
      grades?: string[];
      custom_grade?: string | null;
      locations?: string[];
      custom_location?: string | null;
      sector?: SectorFilter;
      contract_type?: string | null;
      experience_level?: string | null;
    }
  ): Promise<void> {
    const existing = await this.getUserPreferences(userId);
    const now = new Date().toISOString();

    const specialties = JSON.stringify(prefs.specialties ?? existing?.specialties ?? ['info_gen']);
    const grades = JSON.stringify(prefs.grades ?? existing?.grades ?? ['all']);
    const locations = JSON.stringify(prefs.locations ?? existing?.locations ?? ['all']);
    const customGrade = prefs.custom_grade !== undefined ? prefs.custom_grade : existing?.custom_grade;
    const customLoc = prefs.custom_location !== undefined ? prefs.custom_location : existing?.custom_location;
    const sector = prefs.sector ?? existing?.sector ?? 'both';
    const contract = prefs.contract_type !== undefined ? prefs.contract_type : existing?.contract_type ?? 'all';
    const exp = prefs.experience_level !== undefined ? prefs.experience_level : existing?.experience_level ?? 'all';

    await this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, specialties, grades, custom_grade, locations, custom_location, sector, contract_type, experience_level, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           specialties = excluded.specialties,
           grades = excluded.grades,
           custom_grade = excluded.custom_grade,
           locations = excluded.locations,
           custom_location = excluded.custom_location,
           sector = excluded.sector,
           contract_type = excluded.contract_type,
           experience_level = excluded.experience_level,
           updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        specialties,
        grades,
        customGrade || null,
        locations,
        customLoc || null,
        sector,
        contract || null,
        exp || null,
        now
      )
      .run();
  }

  // Conversation state management (isolated per chat)
  public async getConversationState(chatId: string): Promise<ConversationState | null> {
    interface ConvRow {
      chat_id: string;
      step: string;
      data: string;
      updated_at: string;
    }
    const row = await this.db
      .prepare('SELECT * FROM user_conversations WHERE chat_id = ?')
      .bind(chatId)
      .first<ConvRow>();

    if (!row) return null;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data);
    } catch {
      data = {};
    }

    return {
      chat_id: row.chat_id,
      step: row.step,
      data,
      updated_at: row.updated_at,
    };
  }

  public async setConversationState(
    chatId: string,
    step: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const now = new Date().toISOString();
    const jsonStr = JSON.stringify(data);
    await this.db
      .prepare(
        `INSERT INTO user_conversations (chat_id, step, data, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           step = excluded.step,
           data = excluded.data,
           updated_at = excluded.updated_at`
      )
      .bind(chatId, step, jsonStr, now)
      .run();
  }

  public async clearConversationState(chatId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM user_conversations WHERE chat_id = ?')
      .bind(chatId)
      .run();
  }

  // User deletion (/delete_me)
  public async deleteUserCompletely(chatId: string): Promise<boolean> {
    const user = await this.getUserByChatId(chatId);
    if (!user) return false;

    // Delete conversations
    await this.clearConversationState(chatId);

    // Delete user row (cascades preferences and notifications via foreign keys)
    await this.db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    return true;
  }

  // Job announcements storage & retrieval
  public async storeJobAnnouncement(job: IngestJobPayload): Promise<{ isNew: boolean }> {
    const now = new Date().toISOString();
    const existing = await this.db
      .prepare('SELECT id FROM job_announcements WHERE id = ?')
      .bind(job.id)
      .first<{ id: string }>();

    if (existing) {
      await this.db
        .prepare('UPDATE job_announcements SET last_seen_at = ?, deadline = COALESCE(?, deadline), specialite = COALESCE(?, specialite) WHERE id = ?')
        .bind(now, job.deadline || null, job.specialite || null, job.id)
        .run();
      return { isNew: false };
    }

    await this.db
      .prepare(
        `INSERT INTO job_announcements (id, source, source_id, title, employer, description, location, url, grade, specialite, deadline, published_date, raw_text, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        job.id,
        job.source || 'emploi-public.ma',
        job.source_id || null,
        job.title,
        job.employer,
        job.description || '',
        job.location || 'Morocco',
        job.url,
        job.grade || null,
        job.specialite || null,
        job.deadline || null,
        job.published_date || null,
        job.raw_text || null,
        now,
        now
      )
      .run();

    return { isNew: true };
  }

  public async getRecentAnnouncements(limit: number = 30): Promise<StoredJobAnnouncement[]> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM job_announcements ORDER BY first_seen_at DESC LIMIT ?'
      )
      .bind(limit)
      .all<StoredJobAnnouncement>();
    return rows.results || [];
  }

  public async getActiveUsers(): Promise<Array<{ user: UserRecord; preferences: UserPreferences }>> {
    const userRows = await this.db
      .prepare(
        "SELECT * FROM users WHERE status = 'active' AND onboarding_status = 'completed'"
      )
      .all<UserRecord>();

    const users = userRows.results || [];
    const activeList: Array<{ user: UserRecord; preferences: UserPreferences }> = [];

    for (const u of users) {
      const prefs = await this.getUserPreferences(u.id);
      if (prefs) {
        activeList.push({ user: u, preferences: prefs });
      }
    }

    return activeList;
  }

  // Notification deduplication & tracking
  public async hasUserBeenNotified(userId: number, announcementId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT id FROM notifications WHERE user_id = ? AND announcement_id = ?')
      .bind(userId, announcementId)
      .first<{ id: number }>();
    return Boolean(row);
  }

  public async recordNotification(data: {
    userId: number;
    announcementId: string;
    digestDate: string;
    status: 'sent' | 'failed' | 'skipped';
    attemptCount?: number;
    errorMessage?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO notifications (user_id, announcement_id, digest_date, delivery_status, attempt_count, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, announcement_id) DO UPDATE SET
           delivery_status = excluded.delivery_status,
           attempt_count = attempt_count + 1,
           error_message = excluded.error_message`
      )
      .bind(
        data.userId,
        data.announcementId,
        data.digestDate,
        data.status,
        data.attemptCount || 1,
        data.errorMessage || null,
        now
      )
      .run();
  }

  // Rate limiting (window-based)
  public async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    interface RateRow {
      key: string;
      count: number;
      window_start: number;
    }

    const row = await this.db
      .prepare('SELECT * FROM rate_limits WHERE key = ?')
      .bind(key)
      .first<RateRow>();

    if (!row || now - row.window_start > windowMs) {
      // Start new window
      await this.db
        .prepare(
          `INSERT INTO rate_limits (key, count, window_start)
           VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`
        )
        .bind(key, now)
        .run();
      return { allowed: true, remaining: maxRequests - 1 };
    }

    if (row.count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    await this.db
      .prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
      .bind(key)
      .run();

    return { allowed: true, remaining: maxRequests - (row.count + 1) };
  }
}
