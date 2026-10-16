/**
 * Secure internal job ingestion and daily digest dispatch endpoint.
 * Called daily by GitHub Actions to submit normalized Moroccan IT job opportunities,
 * persist them in D1, match against active user profiles, and deliver personalized digests.
 */

import { DbService } from './db.ts';
import { matchJobToUser } from './matching.ts';
import { formatDailyDigest, TelegramBotClient } from './telegram.ts';
import { IngestJobPayload, UserPreferences, UserRecord } from './types.ts';

export interface IngestRequestPayload {
  jobs: IngestJobPayload[];
  dryRun?: boolean;
}

export interface IngestResponse {
  success: boolean;
  totalReceived: number;
  newAnnouncementsStored: number;
  activeUsersMatched: number;
  digestsDelivered: number;
  errors: string[];
}

/**
 * Constant-time string equality check to mitigate timing attacks on internal API secret.
 */
export function secureTimingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export class IngestService {
  constructor(
    private readonly db: DbService,
    private readonly bot: TelegramBotClient,
    private readonly maxBatchLimit: number = 100
  ) {}

  public async processIngest(
    payload: IngestRequestPayload,
    dryRunOverride: boolean = false
  ): Promise<IngestResponse> {
    const response: IngestResponse = {
      success: true,
      totalReceived: 0,
      newAnnouncementsStored: 0,
      activeUsersMatched: 0,
      digestsDelivered: 0,
      errors: [],
    };

    if (!payload || !Array.isArray(payload.jobs)) {
      response.success = false;
      response.errors.push('Invalid payload: "jobs" array is required.');
      return response;
    }

    if (payload.jobs.length > this.maxBatchLimit) {
      response.success = false;
      response.errors.push(`Payload exceeds maximum batch limit of ${this.maxBatchLimit} items.`);
      return response;
    }

    response.totalReceived = payload.jobs.length;
    const isDryRun = Boolean(payload.dryRun || dryRunOverride);
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Ingest and deduplicate announcements into D1
    const storedAnnouncements: IngestJobPayload[] = [];
    for (const job of payload.jobs) {
      // Validate required fields
      if (!job.id || !job.title || !job.url || !job.employer) {
        response.errors.push(`Job announcement missing required fields: ${JSON.stringify(job).slice(0, 80)}`);
        continue;
      }

      try {
        if (!isDryRun) {
          const storeRes = await this.db.storeJobAnnouncement(job);
          if (storeRes.isNew) {
            response.newAnnouncementsStored++;
          }
        }
        storedAnnouncements.push(job);
      } catch (err) {
        response.errors.push(`Failed storing job ${job.id}: ${(err as Error).message}`);
      }
    }

    // 2. Query active users with completed onboarding
    let activeSubscribers: Array<{ user: UserRecord; preferences: UserPreferences }> = [];
    try {
      activeSubscribers = await this.db.getActiveUsers();
    } catch (err) {
      response.success = false;
      response.errors.push(`Failed fetching active subscribers: ${(err as Error).message}`);
      return response;
    }

    // 3. For each active user, evaluate matching jobs not previously notified
    for (const sub of activeSubscribers) {
      const userEligibleJobs: IngestJobPayload[] = [];

      for (const job of storedAnnouncements) {
        // Prevent duplicate notifications using D1 idempotency check
        const alreadyNotified = await this.db.hasUserBeenNotified(sub.user.id, job.id);
        if (alreadyNotified) {
          continue;
        }

        // Match against user's specific preferences
        const matchRes = matchJobToUser(job, sub.preferences);
        if (matchRes.matches) {
          userEligibleJobs.push(job);
        }
      }

      if (userEligibleJobs.length === 0) {
        continue;
      }

      response.activeUsersMatched++;

      if (isDryRun) {
        response.digestsDelivered++;
        continue;
      }

      // 4. Format and send daily digest in the user's chosen language
      const digestChunks = formatDailyDigest(userEligibleJobs, sub.user.language);
      let userDeliverySuccess = true;

      for (const chunk of digestChunks) {
        const sendRes = await this.bot.sendMessage(sub.user.telegram_chat_id, chunk);

        if (!sendRes.ok) {
          userDeliverySuccess = false;
          response.errors.push(
            `Telegram delivery error for user ${sub.user.id}: ${sendRes.description || 'Unknown error'}`
          );

          // Handle blocked bot: auto-pause user to avoid future failed calls
          if (
            sendRes.description &&
            (sendRes.description.includes('bot was blocked by the user') ||
              sendRes.description.includes('user is deactivated') ||
              sendRes.description.includes('chat not found'))
          ) {
            await this.db.updateUserStatus(sub.user.telegram_chat_id, 'paused');
          }
          break;
        }

        // Slight pacing delay between multi-chunk messages to respect Telegram limits
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      // 5. Record notifications in D1
      for (const job of userEligibleJobs) {
        await this.db.recordNotification({
          userId: sub.user.id,
          announcementId: job.id,
          digestDate: todayStr,
          status: userDeliverySuccess ? 'sent' : 'failed',
          attemptCount: 1,
          errorMessage: userDeliverySuccess ? null : 'Failed delivering message',
        });
      }

      if (userDeliverySuccess) {
        response.digestsDelivered++;
      }
    }

    return response;
  }
}
