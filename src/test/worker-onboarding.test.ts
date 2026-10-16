import { describe, it, expect, beforeEach } from 'vitest';
import { MockD1Database } from './mock-d1.ts';
import { DbService } from '../worker/db.ts';
import { TelegramBotClient } from '../worker/telegram.ts';
import { TelegramBotHandler } from '../worker/bot.ts';
import { TelegramUpdate } from '../worker/types.ts';

describe('Cloudflare Worker - Bilingual Telegram Onboarding & Commands', () => {
  let mockDb: MockD1Database;
  let dbService: DbService;
  let sentMessages: Array<{ chatId: string | number; text: string; markup?: any }> = [];

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (urlStr.includes('/sendMessage')) {
      sentMessages.push({
        chatId: body.chat_id,
        text: body.text,
        markup: body.reply_markup,
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }));
    }
    if (urlStr.includes('/editMessageText')) {
      sentMessages.push({
        chatId: body.chat_id,
        text: body.text,
        markup: body.reply_markup,
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: body.message_id } }));
    }
    if (urlStr.includes('/answerCallbackQuery')) {
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response(JSON.stringify({ ok: true }));
  };

  beforeEach(() => {
    mockDb = new MockD1Database();
    dbService = new DbService(mockDb);
    sentMessages = [];
  });

  it('initiates /start with language choice in French and Arabic', async () => {
    const bot = new TelegramBotClient('mock_token', mockFetch as any);
    const handler = new TelegramBotHandler(dbService, bot);

    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 12345, type: 'private', first_name: 'Karim' },
        date: Date.now(),
        text: '/start',
      },
    };

    await handler.handleUpdate(update);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toContain('Bienvenue');
    expect(sentMessages[0].text).toContain('مرحباً');
    expect(sentMessages[0].markup.inline_keyboard[0][0].text).toContain('Français');
    expect(sentMessages[0].markup.inline_keyboard[0][1].text).toContain('العربية');
  });

  it('completes full Arabic onboarding flow with multi-selection and custom grade', async () => {
    const bot = new TelegramBotClient('mock_token', mockFetch as any);
    const handler = new TelegramBotHandler(dbService, bot);
    const chatId = '999888';

    // 1. User starts bot
    await handler.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 999888, type: 'private' },
        date: Date.now(),
        text: '/start',
      },
    });

    // 2. User selects Arabic language
    await handler.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cb_lang_ar',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 100, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'lang:set:ar',
      },
    });

    // Verify user record created with Arabic language
    const user = await dbService.getUserByChatId(chatId);
    expect(user).toBeDefined();
    expect(user?.language).toBe('ar');

    // 3. User toggles specialties: dev_logiciel & cybersecurite
    await handler.handleUpdate({
      update_id: 3,
      callback_query: {
        id: 'cb_spec_dev',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 101, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'spec:toggle:dev_logiciel',
      },
    });

    await handler.handleUpdate({
      update_id: 4,
      callback_query: {
        id: 'cb_spec_cyber',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 101, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'spec:toggle:cybersecurite',
      },
    });

    // Confirm specialties
    await handler.handleUpdate({
      update_id: 5,
      callback_query: {
        id: 'cb_spec_done',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 101, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'spec:done',
      },
    });

    // 4. User selects custom grade
    await handler.handleUpdate({
      update_id: 6,
      callback_query: {
        id: 'cb_grade_custom',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 102, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'grade:toggle:autre',
      },
    });

    // User types custom grade in Arabic
    await handler.handleUpdate({
      update_id: 7,
      message: {
        message_id: 103,
        chat: { id: 999888, type: 'private' },
        date: Date.now(),
        text: 'دبلوم تقني متخصص في الشبكات والأنظمة المعلوماتية',
      },
    });

    // 5. User selects Location: Casablanca
    await handler.handleUpdate({
      update_id: 8,
      callback_query: {
        id: 'cb_loc_casa',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 104, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'loc:select:casablanca',
      },
    });

    // 6. User skips optional sector filter
    await handler.handleUpdate({
      update_id: 9,
      callback_query: {
        id: 'cb_sec_skip',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 105, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'sec:skip',
      },
    });

    // 7. User confirms preferences summary
    await handler.handleUpdate({
      update_id: 10,
      callback_query: {
        id: 'cb_summary_confirm',
        from: { id: 999888, is_bot: false, first_name: 'Youssef' },
        message: { message_id: 106, chat: { id: 999888, type: 'private' }, date: Date.now() },
        data: 'summary:confirm',
      },
    });

    // Assert final D1 state
    const savedUser = await dbService.getUserByChatId(chatId);
    expect(savedUser?.onboarding_status).toBe('completed');

    const prefs = await dbService.getUserPreferences(savedUser!.id);
    expect(prefs).toBeDefined();
    expect(prefs?.specialties).toContain('dev_logiciel');
    expect(prefs?.specialties).toContain('cybersecurite');
    expect(prefs?.custom_grade).toContain('دبلوم تقني متخصص');
    expect(prefs?.locations).toEqual(['casablanca']);
    expect(prefs?.sector).toBe('both');

    // Verify conversation state was cleaned up after completion
    const conv = await dbService.getConversationState(chatId);
    expect(conv).toBeNull();
  });

  it('isolates conversation state between multiple concurrent users', async () => {
    const bot = new TelegramBotClient('mock_token', mockFetch as any);
    const handler = new TelegramBotHandler(dbService, bot);

    const userA = 'user_111';
    const userB = 'user_222';

    // User A selects French
    await handler.handleUpdate({
      update_id: 1,
      message: { message_id: 1, chat: { id: 111, type: 'private' }, date: Date.now(), text: '/start' },
    });
    await handler.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cb_a',
        from: { id: 111, is_bot: false, first_name: 'Alice' },
        message: { message_id: 10, chat: { id: 111, type: 'private' }, date: Date.now() },
        data: 'lang:set:fr',
      },
    });

    // User B selects Arabic
    await handler.handleUpdate({
      update_id: 3,
      message: { message_id: 2, chat: { id: 222, type: 'private' }, date: Date.now(), text: '/start' },
    });
    await handler.handleUpdate({
      update_id: 4,
      callback_query: {
        id: 'cb_b',
        from: { id: 222, is_bot: false, first_name: 'Bilal' },
        message: { message_id: 11, chat: { id: 222, type: 'private' }, date: Date.now() },
        data: 'lang:set:ar',
      },
    });

    const recordA = await dbService.getUserByChatId('111');
    const recordB = await dbService.getUserByChatId('222');

    expect(recordA?.language).toBe('fr');
    expect(recordB?.language).toBe('ar');

    const convA = await dbService.getConversationState('111');
    const convB = await dbService.getConversationState('222');

    expect(convA?.chat_id).toBe('111');
    expect(convB?.chat_id).toBe('222');
  });

  it('supports /pause, /resume, and /delete_me commands', async () => {
    const bot = new TelegramBotClient('mock_token', mockFetch as any);
    const handler = new TelegramBotHandler(dbService, bot);
    const chatId = '555444';

    // Create user
    await dbService.getOrCreateUser({ chatId, firstName: 'Mehdi' });

    // Test /pause
    await handler.handleUpdate({
      update_id: 1,
      message: { message_id: 1, chat: { id: 555444, type: 'private' }, date: Date.now(), text: '/pause' },
    });
    let user = await dbService.getUserByChatId(chatId);
    expect(user?.status).toBe('paused');

    // Test /resume
    await handler.handleUpdate({
      update_id: 2,
      message: { message_id: 2, chat: { id: 555444, type: 'private' }, date: Date.now(), text: '/resume' },
    });
    user = await dbService.getUserByChatId(chatId);
    expect(user?.status).toBe('active');

    // Test /delete_me prompt
    await handler.handleUpdate({
      update_id: 3,
      message: { message_id: 3, chat: { id: 555444, type: 'private' }, date: Date.now(), text: '/delete_me' },
    });
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('Confirmation de suppression');

    // Confirm deletion
    await handler.handleUpdate({
      update_id: 4,
      callback_query: {
        id: 'cb_del',
        from: { id: 555444, is_bot: false, first_name: 'Mehdi' },
        message: { message_id: 99, chat: { id: 555444, type: 'private' }, date: Date.now() },
        data: 'del:confirm',
      },
    });

    user = await dbService.getUserByChatId(chatId);
    expect(user).toBeNull();
  });
});
