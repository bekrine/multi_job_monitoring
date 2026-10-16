/**
 * Type definitions for Cloudflare Worker multi-user Telegram service.
 */

export type Language = 'fr' | 'ar';
export type UserStatus = 'active' | 'paused' | 'deleted';
export type OnboardingStatus = 'new' | 'in_progress' | 'completed';
export type SectorFilter = 'public' | 'private' | 'both';

export interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta: Record<string, unknown>;
}

export interface D1ExecResult {
  count?: number;
  duration?: number;
  meta: {
    last_row_id?: number | string;
    changes?: number;
    [key: string]: unknown;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1ExecResult>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  INTERNAL_API_SECRET: string;
  DEFAULT_LANGUAGE?: string;
  RATE_LIMIT_SEARCH_PER_MINUTE?: string;
  BATCH_NOTIFICATION_LIMIT?: string;
  OPENROUTER_API_KEY?: string;
  HF_TOKEN?: string;
}

export interface UserRecord {
  id: number;
  telegram_chat_id: string;
  telegram_user_id?: string | null;
  username?: string | null;
  first_name?: string | null;
  language: Language;
  status: UserStatus;
  onboarding_status: OnboardingStatus;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: number;
  specialties: string[];
  grades: string[];
  custom_grade?: string | null;
  locations: string[];
  custom_location?: string | null;
  sector: SectorFilter;
  contract_type?: string | null;
  experience_level?: string | null;
  updated_at: string;
}

export interface ConversationState {
  chat_id: string;
  step: string;
  data: Record<string, unknown>;
  updated_at: string;
}

export interface IngestJobPayload {
  id: string;
  source: string;
  source_id?: string;
  title: string;
  employer: string;
  description: string;
  location: string;
  url: string;
  grade?: string;
  specialite?: string;
  deadline?: string;
  published_date?: string;
  raw_text?: string;
}

export interface StoredJobAnnouncement extends IngestJobPayload {
  first_seen_at: string;
  last_seen_at: string;
}

export interface NotificationRecord {
  id: number;
  user_id: number;
  announcement_id: string;
  digest_date: string;
  delivery_status: 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  error_message?: string | null;
  created_at: string;
}

// Telegram Bot API Types
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
