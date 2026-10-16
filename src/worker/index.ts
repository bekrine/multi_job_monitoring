/**
 * Cloudflare Worker entry point for Morocco IT Job Monitoring multi-user Telegram service.
 * Handles Telegram webhooks, internal job ingestion from GitHub Actions, and health checks.
 */

import { TelegramBotHandler } from './bot.ts';
import { DbService } from './db.ts';
import { IngestRequestPayload, IngestService, secureTimingSafeEqual } from './ingest.ts';
import { TelegramBotClient } from './telegram.ts';
import { Env, ExecutionContext, TelegramUpdate } from './types.ts';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check endpoint
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'morocco-it-jobs-telegram-bot',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Telegram Webhook handler
    if (
      request.method === 'POST' &&
      (url.pathname === '/webhook' || url.pathname === '/telegram/webhook' || url.pathname === '/')
    ) {
      // Validate webhook secret token if configured
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const receivedToken = request.headers.get('x-telegram-bot-api-secret-token') || '';
        if (!secureTimingSafeEqual(receivedToken, env.TELEGRAM_WEBHOOK_SECRET)) {
          return new Response(JSON.stringify({ error: 'Unauthorized webhook token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const db = new DbService(env.DB);
      const bot = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
      const maxSearchRate = parseInt(env.RATE_LIMIT_SEARCH_PER_MINUTE || '5', 10);
      const botHandler = new TelegramBotHandler(db, bot, maxSearchRate);

      // Process update in background if needed or wait
      try {
        await botHandler.handleUpdate(update);
      } catch (err) {
        console.error('Error handling Telegram update:', (err as Error).message);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Secured Internal Job Ingestion Endpoint (Called daily by GitHub Actions)
    if (request.method === 'POST' && url.pathname === '/api/ingest-jobs') {
      // Require configured internal secret
      if (!env.INTERNAL_API_SECRET) {
        return new Response(
          JSON.stringify({ error: 'INTERNAL_API_SECRET is not configured on Worker' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Check header authentication
      const authHeader = request.headers.get('authorization') || '';
      const secretHeader = request.headers.get('x-internal-secret') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const clientSecret = secretHeader || bearerToken;

      if (!clientSecret || !secureTimingSafeEqual(clientSecret, env.INTERNAL_API_SECRET)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid internal secret' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      let payload: IngestRequestPayload;
      try {
        payload = (await request.json()) as IngestRequestPayload;
      } catch {
        return new Response(
          JSON.stringify({ error: 'Malformed JSON body' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const db = new DbService(env.DB);
      const bot = new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);
      const batchLimit = parseInt(env.BATCH_NOTIFICATION_LIMIT || '50', 10);
      const ingestService = new IngestService(db, bot, batchLimit);

      try {
        const result = await ingestService.processIngest(payload);
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: (err as Error).message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
