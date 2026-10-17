/**
 * Lightweight Telegram Bot API client for Cloudflare Workers runtime.
 * Handles HTML message formatting, inline keyboard rendering, character chunking,
 * rate limit handling, and bilingual message generation.
 */

import { IngestJobPayload, InlineKeyboardMarkup, Language } from './types.ts';
import { MESSAGES } from './i18n.ts';

export function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SendMessageOptions {
  replyMarkup?: InlineKeyboardMarkup;
  parseMode?: 'HTML' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

export class TelegramBotClient {
  constructor(
    private readonly botToken: string,
    // FIX: wrap fetch so it is not called with `this` = TelegramBotClient
    // (causes "Illegal invocation" in Cloudflare Workers).
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args)
  ) {}

  public async sendMessage(
    chatId: string | number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<{ ok: boolean; messageId?: number; description?: string; retryAfter?: number }> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disableWebPagePreview ?? true,
    };

    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
        parameters?: { retry_after?: number };
      };

      if (!data.ok) {
        console.error('Telegram sendMessage failed:', data.description, 'chat:', chatId);
        return {
          ok: false,
          description: data.description,
          retryAfter: data.parameters?.retry_after,
        };
      }

      return { ok: true, messageId: data.result?.message_id };
    } catch (err) {
      console.error('Telegram sendMessage fetch error:', (err as Error).message);
      return { ok: false, description: (err as Error).message };
    }
  }

  public async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<{ ok: boolean; description?: string }> {
    const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disableWebPagePreview ?? true,
    };

    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { ok: boolean; description?: string };
      if (!data.ok) {
        console.error('Telegram editMessageText failed:', data.description);
      }
      return { ok: data.ok, description: data.description };
    } catch (err) {
      console.error('Telegram editMessageText fetch error:', (err as Error).message);
      return { ok: false, description: (err as Error).message };
    }
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string
  ): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`;
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || '',
        }),
      });
      const data = (await res.json()) as { ok: boolean; description?: string };
      if (!data.ok) {
        console.error('Telegram answerCallbackQuery failed:', data.description);
      }
      return data.ok;
    } catch (err) {
      console.error('Telegram answerCallbackQuery fetch error:', (err as Error).message);
      return false;
    }
  }
}

/**
 * Formats a single job announcement for Telegram HTML view.
 */
export function formatJobCard(job: IngestJobPayload, lang: Language): string {
  const isAr = lang === 'ar';
  const lines: string[] = [];

  const titlePrefix = isAr ? '💼 <b>المباراة/الوظيفة:</b>' : '💼 <b>Poste:</b>';
  const employerPrefix = isAr ? '🏛️ <b>المشغل/الإدارة:</b>' : '🏛️ <b>Organisme:</b>';
  const locationPrefix = isAr ? '📍 <b>الموقع:</b>' : '📍 <b>Localisation:</b>';
  const gradePrefix = isAr ? '🎓 <b>الرتبة/الشهادة:</b>' : '🎓 <b>Grade/Diplôme:</b>';
  const specPrefix = isAr ? '🎯 <b>التخصص:</b>' : '🎯 <b>Spécialité:</b>';
  const deadlinePrefix = isAr ? '⏰ <b>آخر أجل للترشيح:</b>' : '⏰ <b>Délai de dépôt:</b>';
  const linkText = isAr ? '🔗 التفاصيل ورابط الترشيح' : '🔗 Consulter l\'annonce officielle';

  lines.push(`${titlePrefix} ${escapeHtml(job.title)}`);
  lines.push(`${employerPrefix} ${escapeHtml(job.employer)}`);
  lines.push(`${locationPrefix} ${escapeHtml(job.location || (isAr ? 'المغرب' : 'Maroc'))}`);

  if (job.grade) {
    lines.push(`${gradePrefix} ${escapeHtml(job.grade)}`);
  }
  if (job.specialite) {
    lines.push(`${specPrefix} ${escapeHtml(job.specialite)}`);
  }
  if (job.deadline) {
    lines.push(`${deadlinePrefix} <code>${escapeHtml(job.deadline)}</code>`);
  }

  // FIX: escape the URL so "&" or quotes cannot break the HTML parse
  lines.push(`<a href="${escapeHtml(job.url)}">${linkText}</a>`);

  return lines.join('\n');
}

/**
 * Formats a list of matching jobs into one or more chunks suitable for Telegram.
 * Telegram has a 4096 character limit per message; chunks keep messages neat and readable.
 */
export function formatDailyDigest(
  jobs: IngestJobPayload[],
  lang: Language
): string[] {
  const dict = MESSAGES[lang];
  if (jobs.length === 0) {
    return [
      `${dict.digest_header}\n\n${lang === 'ar' ? 'ℹ️ لا توجد فرص جديدة اليوم تطابق معاييرك.' : 'ℹ️ Aucune nouvelle offre aujourd\'hui correspondant à vos critères.'}\n\n${dict.digest_footer}`,
    ];
  }

  const chunks: string[] = [];
  let current = `${dict.digest_header}\n\n`;

  for (let i = 0; i < jobs.length; i++) {
    const card = `<b>[${i + 1}/${jobs.length}]</b>\n${formatJobCard(jobs[i], lang)}\n\n`;

    // Check if adding this card exceeds safe length (leave margin for footer)
    if (current.length + card.length > 3600) {
      chunks.push(current.trim());
      current = '';
    }
    current += card;
  }

  if (current.trim().length > 0) {
    current += `\n${dict.digest_footer}`;
    chunks.push(current.trim());
  } else if (chunks.length > 0) {
    // Append footer to the last chunk
    chunks[chunks.length - 1] += `\n\n${dict.digest_footer}`;
  }

  return chunks;
}