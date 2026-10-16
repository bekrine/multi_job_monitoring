import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/index.ts';
import { MockD1Database } from './mock-d1.ts';
import { Env } from '../worker/types.ts';
import { secureTimingSafeEqual } from '../worker/ingest.ts';

describe('Cloudflare Worker - Internal Ingest & Webhook Security', () => {
  let mockDb: MockD1Database;
  let env: Env;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = {
      DB: mockDb,
      TELEGRAM_BOT_TOKEN: 'mock_bot_token',
      TELEGRAM_WEBHOOK_SECRET: 'test_webhook_secret_xyz_123',
      INTERNAL_API_SECRET: 'super_secret_internal_key_abc_987',
      BATCH_NOTIFICATION_LIMIT: '50',
    };
  });

  it('secureTimingSafeEqual validates tokens correctly without leakage', () => {
    expect(secureTimingSafeEqual('abc', 'abc')).toBe(true);
    expect(secureTimingSafeEqual('abc', 'abd')).toBe(false);
    expect(secureTimingSafeEqual('abc', 'abcd')).toBe(false);
    expect(secureTimingSafeEqual('', '')).toBe(true);
    expect(secureTimingSafeEqual(null as any, 'abc')).toBe(false);
  });

  it('rejects unauthorized requests to /api/ingest-jobs missing secret', async () => {
    const req = new Request('https://worker.dev/api/ingest-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: [] }),
    });

    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  it('rejects incorrect secret on /api/ingest-jobs', async () => {
    const req = new Request('https://worker.dev/api/ingest-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': 'wrong_secret',
      },
      body: JSON.stringify({ jobs: [] }),
    });

    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(401);
  });

  it('accepts authorized requests to /api/ingest-jobs with correct secret', async () => {
    const req = new Request('https://worker.dev/api/ingest-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': 'super_secret_internal_key_abc_987',
      },
      body: JSON.stringify({
        jobs: [
          {
            id: 'job-valid-01',
            source: 'emploi-public.ma',
            title: 'Développeur Fullstack React / Node.js',
            employer: 'CDG Maroc',
            location: 'Rabat',
            url: 'https://example.com/job1',
            description: 'Recrutement développeur logiciel.',
          },
        ],
      }),
    });

    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newAnnouncementsStored).toBe(1);
  });

  it('verifies Telegram webhook token authenticity header', async () => {
    // 1. Without secret token -> 401
    const unauthReq = new Request('https://worker.dev/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });

    const unauthRes = await worker.fetch(unauthReq, env, {} as any);
    expect(unauthRes.status).toBe(401);

    // 2. With valid secret token -> 200
    const authReq = new Request('https://worker.dev/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test_webhook_secret_xyz_123',
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    const authRes = await worker.fetch(authReq, env, {} as any);
    expect(authRes.status).toBe(200);
  });

  it('serves health check endpoint with service status', async () => {
    const req = new Request('https://worker.dev/api/health', {
      method: 'GET',
    });

    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('morocco-it-jobs-telegram-bot');
  });
});
