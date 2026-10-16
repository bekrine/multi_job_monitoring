/**
 * In-memory Mock D1 Database implementation for unit & integration testing.
 * Simulates D1Database interface, prepared statements, binding, first(), all(), and run()
 * storing users, user_preferences, user_conversations, job_announcements, notifications, and rate_limits.
 */

import { D1Database, D1ExecResult, D1PreparedStatement, D1Result } from '../worker/types.ts';

export class MockD1Database implements D1Database {
  public users: Map<number, any> = new Map();
  public userPreferences: Map<number, any> = new Map();
  public userConversations: Map<string, any> = new Map();
  public jobAnnouncements: Map<string, any> = new Map();
  public notifications: Map<string, any> = new Map(); // key: `${userId}:${announcementId}`
  public rateLimits: Map<string, any> = new Map();
  private nextUserId: number = 1;
  private nextNotifId: number = 1;

  public prepare(query: string): D1PreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  public async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      results.push(await stmt.all<T>());
    }
    return results;
  }

  public async exec(query: string): Promise<D1ExecResult> {
    return { count: 1, duration: 1, meta: {} };
  }

  // Internal helpers
  public getNextUserId(): number {
    return this.nextUserId++;
  }

  public getNextNotifId(): number {
    return this.nextNotifId++;
  }

  public clear(): void {
    this.users.clear();
    this.userPreferences.clear();
    this.userConversations.clear();
    this.jobAnnouncements.clear();
    this.notifications.clear();
    this.rateLimits.clear();
    this.nextUserId = 1;
    this.nextNotifId = 1;
  }
}

class MockPreparedStatement implements D1PreparedStatement {
  private boundValues: unknown[] = [];

  constructor(private readonly db: MockD1Database, private readonly sql: string) {}

  public bind(...values: unknown[]): D1PreparedStatement {
    this.boundValues = values;
    return this;
  }

  public async first<T = unknown>(colName?: string): Promise<T | null> {
    const result = await this.all<T>();
    if (result.results && result.results.length > 0) {
      const row = result.results[0];
      if (colName && typeof row === 'object' && row !== null) {
        return (row as any)[colName] ?? null;
      }
      return row;
    }
    return null;
  }

  public async all<T = unknown>(): Promise<D1Result<T>> {
    const normSql = this.sql.trim().toLowerCase();

    // 1. SELECT * FROM users WHERE telegram_chat_id = ?
    if (normSql.includes('select * from users where telegram_chat_id =')) {
      const chatId = String(this.boundValues[0]);
      for (const u of this.db.users.values()) {
        if (u.telegram_chat_id === chatId) {
          return { results: [{ ...u }] as T[], meta: {} };
        }
      }
      return { results: [], meta: {} };
    }

    // 2. SELECT * FROM users WHERE status = 'active' AND onboarding_status = 'completed'
    if (normSql.includes('select * from users where status = \'active\' and onboarding_status = \'completed\'')) {
      const matched = Array.from(this.db.users.values()).filter(
        (u) => u.status === 'active' && u.onboarding_status === 'completed'
      );
      return { results: matched.map((m) => ({ ...m })) as T[], meta: {} };
    }

    // 3. SELECT * FROM user_preferences WHERE user_id = ?
    if (normSql.includes('select * from user_preferences where user_id =')) {
      const uid = Number(this.boundValues[0]);
      const p = this.db.userPreferences.get(uid);
      return { results: p ? [{ ...p }] as T[] : [], meta: {} };
    }

    // 4. SELECT * FROM user_conversations WHERE chat_id = ?
    if (normSql.includes('select * from user_conversations where chat_id =')) {
      const cid = String(this.boundValues[0]);
      const c = this.db.userConversations.get(cid);
      return { results: c ? [{ ...c }] as T[] : [], meta: {} };
    }

    // 5. SELECT id FROM job_announcements WHERE id = ?
    if (normSql.includes('select id from job_announcements where id =')) {
      const jid = String(this.boundValues[0]);
      const j = this.db.jobAnnouncements.get(jid);
      return { results: j ? [{ id: j.id }] as T[] : [], meta: {} };
    }

    // 6. SELECT * FROM job_announcements ORDER BY first_seen_at DESC LIMIT ?
    if (normSql.includes('select * from job_announcements order by first_seen_at desc limit')) {
      const limit = Number(this.boundValues[0]) || 20;
      const sorted = Array.from(this.db.jobAnnouncements.values())
        .sort((a, b) => (b.first_seen_at > a.first_seen_at ? 1 : -1))
        .slice(0, limit);
      return { results: sorted.map((s) => ({ ...s })) as T[], meta: {} };
    }

    // 7. SELECT id FROM notifications WHERE user_id = ? AND announcement_id = ?
    if (normSql.includes('select id from notifications where user_id = ? and announcement_id = ?')) {
      const uid = Number(this.boundValues[0]);
      const aid = String(this.boundValues[1]);
      const key = `${uid}:${aid}`;
      const n = this.db.notifications.get(key);
      return { results: n ? [{ id: n.id }] as T[] : [], meta: {} };
    }

    // 8. SELECT * FROM rate_limits WHERE key = ?
    if (normSql.includes('select * from rate_limits where key =')) {
      const k = String(this.boundValues[0]);
      const r = this.db.rateLimits.get(k);
      return { results: r ? [{ ...r }] as T[] : [], meta: {} };
    }

    return { results: [], meta: {} };
  }

  public async run(): Promise<D1ExecResult> {
    const normSql = this.sql.trim().toLowerCase();

    // 1. INSERT INTO users ...
    if (normSql.startsWith('insert into users')) {
      const chatId = String(this.boundValues[0]);
      const userId = this.boundValues[1] ? String(this.boundValues[1]) : null;
      const username = this.boundValues[2] ? String(this.boundValues[2]) : null;
      const firstName = this.boundValues[3] ? String(this.boundValues[3]) : null;
      const language = String(this.boundValues[4]);
      const createdAt = String(this.boundValues[5]);
      const updatedAt = String(this.boundValues[6]);
      const id = this.db.getNextUserId();

      const user = {
        id,
        telegram_chat_id: chatId,
        telegram_user_id: userId,
        username,
        first_name: firstName,
        language,
        status: 'active',
        onboarding_status: 'new',
        created_at: createdAt,
        updated_at: updatedAt,
      };
      this.db.users.set(id, user);
      return { meta: { last_row_id: id, changes: 1 } };
    }

    // 2. UPDATE users SET username = ..., first_name = ...
    if (normSql.startsWith('update users set username =')) {
      const username = this.boundValues[0] as string | null;
      const firstName = this.boundValues[1] as string | null;
      const updatedAt = String(this.boundValues[2]);
      const id = Number(this.boundValues[3]);

      const user = this.db.users.get(id);
      if (user) {
        user.username = username;
        user.first_name = firstName;
        user.updated_at = updatedAt;
      }
      return { meta: { changes: 1 } };
    }

    // 3. UPDATE users SET language = ... WHERE telegram_chat_id = ?
    if (normSql.startsWith('update users set language =')) {
      const lang = String(this.boundValues[0]);
      const updatedAt = String(this.boundValues[1]);
      const chatId = String(this.boundValues[2]);

      for (const u of this.db.users.values()) {
        if (u.telegram_chat_id === chatId) {
          u.language = lang;
          u.updated_at = updatedAt;
          break;
        }
      }
      return { meta: { changes: 1 } };
    }

    // 4. UPDATE users SET status = ...
    if (normSql.startsWith('update users set status =')) {
      const status = String(this.boundValues[0]);
      const updatedAt = String(this.boundValues[1]);
      const chatId = String(this.boundValues[2]);

      for (const u of this.db.users.values()) {
        if (u.telegram_chat_id === chatId) {
          u.status = status;
          u.updated_at = updatedAt;
          break;
        }
      }
      return { meta: { changes: 1 } };
    }

    // 5. UPDATE users SET onboarding_status = ...
    if (normSql.startsWith('update users set onboarding_status =')) {
      const status = String(this.boundValues[0]);
      const updatedAt = String(this.boundValues[1]);
      const chatId = String(this.boundValues[2]);

      for (const u of this.db.users.values()) {
        if (u.telegram_chat_id === chatId) {
          u.onboarding_status = status;
          u.updated_at = updatedAt;
          break;
        }
      }
      return { meta: { changes: 1 } };
    }

    // 6. DELETE FROM users WHERE id = ?
    if (normSql.startsWith('delete from users where id =')) {
      const id = Number(this.boundValues[0]);
      this.db.users.delete(id);
      this.db.userPreferences.delete(id);
      // Delete notifications
      for (const [k, n] of this.db.notifications.entries()) {
        if (n.user_id === id) this.db.notifications.delete(k);
      }
      return { meta: { changes: 1 } };
    }

    // 7. INSERT INTO user_preferences ...
    if (normSql.includes('into user_preferences')) {
      const uid = Number(this.boundValues[0]);
      const specs = String(this.boundValues[1]);
      const grades = String(this.boundValues[2]);
      let customGrade: string | null = null;
      let locs = '["all"]';
      let customLoc: string | null = null;
      let sector = 'both';
      let contract = 'all';
      let exp = 'all';
      let updatedAt = new Date().toISOString();

      if (this.boundValues.length >= 10) {
        customGrade = (this.boundValues[3] as string) || null;
        locs = String(this.boundValues[4]);
        customLoc = (this.boundValues[5] as string) || null;
        sector = String(this.boundValues[6]);
        contract = (this.boundValues[7] as string) || 'all';
        exp = (this.boundValues[8] as string) || 'all';
        updatedAt = String(this.boundValues[9]);
      } else {
        locs = String(this.boundValues[3]);
        updatedAt = String(this.boundValues[this.boundValues.length - 1]);
      }

      const pref = {
        user_id: uid,
        specialties: specs,
        grades,
        custom_grade: customGrade,
        locations: locs,
        custom_location: customLoc,
        sector,
        contract_type: contract,
        experience_level: exp,
        updated_at: updatedAt,
      };
      this.db.userPreferences.set(uid, pref);
      return { meta: { last_row_id: uid, changes: 1 } };
    }

    // 8. INSERT INTO user_conversations ...
    if (normSql.startsWith('insert into user_conversations')) {
      const cid = String(this.boundValues[0]);
      const step = String(this.boundValues[1]);
      const data = String(this.boundValues[2]);
      const updatedAt = String(this.boundValues[3]);

      this.db.userConversations.set(cid, {
        chat_id: cid,
        step,
        data,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    // 9. DELETE FROM user_conversations WHERE chat_id = ?
    if (normSql.startsWith('delete from user_conversations where chat_id =')) {
      const cid = String(this.boundValues[0]);
      this.db.userConversations.delete(cid);
      return { meta: { changes: 1 } };
    }

    // 10. INSERT INTO job_announcements ...
    if (normSql.startsWith('insert into job_announcements')) {
      const id = String(this.boundValues[0]);
      const source = String(this.boundValues[1]);
      const sourceId = (this.boundValues[2] as string) || null;
      const title = String(this.boundValues[3]);
      const employer = String(this.boundValues[4]);
      const description = String(this.boundValues[5]);
      const location = String(this.boundValues[6]);
      const url = String(this.boundValues[7]);
      const grade = (this.boundValues[8] as string) || null;
      const specialite = (this.boundValues[9] as string) || null;
      const deadline = (this.boundValues[10] as string) || null;
      const publishedDate = (this.boundValues[11] as string) || null;
      const rawText = (this.boundValues[12] as string) || null;
      const firstSeen = String(this.boundValues[13]);
      const lastSeen = String(this.boundValues[14]);

      this.db.jobAnnouncements.set(id, {
        id,
        source,
        source_id: sourceId,
        title,
        employer,
        description,
        location,
        url,
        grade,
        specialite,
        deadline,
        published_date: publishedDate,
        raw_text: rawText,
        first_seen_at: firstSeen,
        last_seen_at: lastSeen,
      });
      return { meta: { changes: 1 } };
    }

    // 11. UPDATE job_announcements SET last_seen_at = ...
    if (normSql.startsWith('update job_announcements set last_seen_at =')) {
      const now = String(this.boundValues[0]);
      const deadline = (this.boundValues[1] as string) || null;
      const specialite = (this.boundValues[2] as string) || null;
      const id = String(this.boundValues[3]);

      const job = this.db.jobAnnouncements.get(id);
      if (job) {
        job.last_seen_at = now;
        if (deadline) job.deadline = deadline;
        if (specialite) job.specialite = specialite;
      }
      return { meta: { changes: 1 } };
    }

    // 12. INSERT INTO notifications ...
    if (normSql.startsWith('insert into notifications')) {
      const uid = Number(this.boundValues[0]);
      const aid = String(this.boundValues[1]);
      const digestDate = String(this.boundValues[2]);
      const status = String(this.boundValues[3]);
      const attemptCount = Number(this.boundValues[4]) || 1;
      const errMsg = (this.boundValues[5] as string) || null;
      const createdAt = String(this.boundValues[6]);

      const key = `${uid}:${aid}`;
      this.db.notifications.set(key, {
        id: this.db.getNextNotifId(),
        user_id: uid,
        announcement_id: aid,
        digest_date: digestDate,
        delivery_status: status,
        attempt_count: attemptCount,
        error_message: errMsg,
        created_at: createdAt,
      });
      return { meta: { changes: 1 } };
    }

    // 13. Rate limits
    if (normSql.includes('into rate_limits')) {
      const k = String(this.boundValues[0]);
      const w = Number(this.boundValues[1]);
      this.db.rateLimits.set(k, { key: k, count: 1, window_start: w });
      return { meta: { changes: 1 } };
    }

    if (normSql.startsWith('update rate_limits set count = count + 1')) {
      const k = String(this.boundValues[0]);
      const r = this.db.rateLimits.get(k);
      if (r) r.count++;
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }
}
