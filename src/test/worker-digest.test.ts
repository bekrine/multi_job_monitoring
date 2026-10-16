import { describe, it, expect, beforeEach } from 'vitest';
import { formatDailyDigest, TelegramBotClient } from '../worker/telegram.ts';
import { IngestJobPayload } from '../worker/types.ts';
import { DbService } from '../worker/db.ts';
import { MockD1Database } from './mock-d1.ts';
import { IngestService } from '../worker/ingest.ts';

describe('Cloudflare Worker - Daily Digest & Duplicate Prevention', () => {
  let mockDb: MockD1Database;
  let dbService: DbService;
  let sentMessages: Array<{ chatId: string | number; text: string }> = [];

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (urlStr.includes('/sendMessage')) {
      sentMessages.push({
        chatId: body.chat_id,
        text: body.text,
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 202 } }));
    }
    return new Response(JSON.stringify({ ok: true }));
  };

  beforeEach(() => {
    mockDb = new MockD1Database();
    dbService = new DbService(mockDb);
    sentMessages = [];
  });

  const sampleJob: IngestJobPayload = {
    id: 'job-digest-01',
    source: 'emploi-public.ma',
    title: 'مباراة توظيف مهندس دولة تخصص نظم المعلومات',
    employer: 'Ministère de la Santé',
    location: 'Rabat',
    url: 'https://example.com/job-digest-01',
    grade: 'Ingénieur d\'État',
    specialite: 'Informatique',
    deadline: '30 Novembre 2026',
    description: 'Poste d\'ingénieur informatique pour la gestion du dossier patient informatisé.',
  };

  it('formats bilingual digests for French and Arabic users', () => {
    const frChunks = formatDailyDigest([sampleJob], 'fr');
    expect(frChunks).toHaveLength(1);
    expect(frChunks[0]).toContain('Votre récapitulatif quotidien Emploi IT Maroc');
    expect(frChunks[0]).toContain('Poste:');
    expect(frChunks[0]).toContain('30 Novembre 2026');

    const arChunks = formatDailyDigest([sampleJob], 'ar');
    expect(arChunks).toHaveLength(1);
    expect(arChunks[0]).toContain('تقريرك اليومي');
    expect(arChunks[0]).toContain('المباراة/الوظيفة:');
    expect(arChunks[0]).toContain('آخر أجل للترشيح:');
  });

  it('splits large batches into multiple chunks under Telegram limits', () => {
    const manyJobs: IngestJobPayload[] = [];
    for (let i = 1; i <= 25; i++) {
      manyJobs.push({
        ...sampleJob,
        id: `job-batch-${i}`,
        title: `Offre IT Numéro ${i} - Ingénieur Système et Cloud AWS DevOps Kubernetes CI/CD`,
      });
    }

    const chunks = formatDailyDigest(manyJobs, 'fr');
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('prevents duplicate notifications across consecutive runs', async () => {
    // 1. Setup an active user
    const user = await dbService.getOrCreateUser({ chatId: '777111', defaultLang: 'fr' });
    await dbService.updateOnboardingStatus(user.telegram_chat_id, 'completed');
    await dbService.saveUserPreferences(user.id, {
      specialties: ['info_gen'],
      grades: ['all'],
      locations: ['all'],
      sector: 'both',
    });

    const bot = new TelegramBotClient('mock_token', mockFetch as any);
    const ingest = new IngestService(dbService, bot);

    // First ingestion run: should deliver digest
    const run1 = await ingest.processIngest({ jobs: [sampleJob] });
    expect(run1.success).toBe(true);
    expect(run1.newAnnouncementsStored).toBe(1);
    expect(run1.digestsDelivered).toBe(1);
    expect(sentMessages).toHaveLength(1);

    // Verify notification was recorded in D1
    const alreadyNotified = await dbService.hasUserBeenNotified(user.id, sampleJob.id);
    expect(alreadyNotified).toBe(true);

    // Second ingestion run with the same job: must NOT notify again
    const run2 = await ingest.processIngest({ jobs: [sampleJob] });
    expect(run2.success).toBe(true);
    expect(run2.newAnnouncementsStored).toBe(0); // already stored
    expect(run2.digestsDelivered).toBe(0); // duplicate skipped!
    expect(sentMessages).toHaveLength(1); // no new message sent
  });

  it('pauses user when Telegram returns blocked bot error', async () => {
    const user = await dbService.getOrCreateUser({ chatId: 'blocked_user', defaultLang: 'fr' });
    await dbService.updateOnboardingStatus(user.telegram_chat_id, 'completed');
    await dbService.saveUserPreferences(user.id, {
      specialties: ['info_gen'],
      grades: ['all'],
      locations: ['all'],
    });

    const blockedFetch = async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          description: 'Forbidden: bot was blocked by the user',
        })
      );
    };

    const bot = new TelegramBotClient('mock_token', blockedFetch as any);
    const ingest = new IngestService(dbService, bot);

    await ingest.processIngest({ jobs: [sampleJob] });

    // Verify user was automatically set to 'paused'
    const updatedUser = await dbService.getUserByChatId('blocked_user');
    expect(updatedUser?.status).toBe('paused');
  });
});
