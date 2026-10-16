/**
 * Interactive Telegram Bot controller for Cloudflare Workers.
 * Implements bilingual conversational onboarding, commands (/start, /help, /profile,
 * /edit, /language, /pause, /resume, /search, /delete_me), inline keyboard state transitions,
 * and isolated D1 conversation tracking.
 */

import { DbService } from './db.ts';
import {
  InlineKeyboardMarkup,
  Language,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
  UserPreferences,
  UserRecord,
} from './types.ts';
import {
  CONTRACT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GRADE_OPTIONS,
  LOCATION_OPTIONS,
  MESSAGES,
  OptionItem,
  SECTOR_OPTIONS,
  SPECIALTY_OPTIONS,
  getLabel,
} from './i18n.ts';
import { formatDailyDigest, formatJobCard, TelegramBotClient } from './telegram.ts';
import { matchJobToUser } from './matching.ts';

export class TelegramBotHandler {
  constructor(
    private readonly db: DbService,
    private readonly bot: TelegramBotClient,
    private readonly rateLimitMax: number = 5
  ) {}

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message && update.message.text) {
      await this.handleTextMessage(update.message);
    }
  }

  // 1. Text Message Router
  private async handleTextMessage(msg: TelegramMessage): Promise<void> {
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();

    const user = await this.db.getOrCreateUser({
      chatId,
      userId: msg.from?.id ? String(msg.from.id) : null,
      username: msg.from?.username || null,
      firstName: msg.from?.first_name || null,
      defaultLang: msg.from?.language_code?.startsWith('ar') ? 'ar' : 'fr',
    });

    // Check commands first
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase().split('@')[0];
      await this.handleCommand(command, user, msg);
      return;
    }

    // Check ongoing conversational step
    const conv = await this.db.getConversationState(chatId);
    if (conv) {
      await this.handleConversationInput(conv.step, conv.data, text, user);
      return;
    }

    // Default response for unprompted messages
    const dict = MESSAGES[user.language];
    await this.bot.sendMessage(
      chatId,
      `${dict.help_text}`
    );
  }

  // 2. Command Handler
  private async handleCommand(
    cmd: string,
    user: UserRecord,
    msg: TelegramMessage
  ): Promise<void> {
    const chatId = user.telegram_chat_id;
    const dict = MESSAGES[user.language];

    switch (cmd) {
      case '/start': {
        // Clear any prior unfinished onboarding conversation
        await this.db.clearConversationState(chatId);

        // Always allow language selection at start
        const kb: InlineKeyboardMarkup = {
          inline_keyboard: [
            [
              { text: '🇫🇷 Français', callback_data: 'lang:set:fr' },
              { text: '🇲🇦 العربية', callback_data: 'lang:set:ar' },
            ],
          ],
        };

        await this.bot.sendMessage(
          chatId,
          `${MESSAGES.fr.welcome}\n\n${MESSAGES.ar.welcome}`,
          { replyMarkup: kb }
        );
        break;
      }

      case '/help': {
        await this.bot.sendMessage(chatId, dict.help_text);
        break;
      }

      case '/profile': {
        await this.sendProfileView(user);
        break;
      }

      case '/edit': {
        await this.startOnboarding(user);
        break;
      }

      case '/language': {
        const kb: InlineKeyboardMarkup = {
          inline_keyboard: [
            [
              { text: '🇫🇷 Français', callback_data: 'lang:set:fr' },
              { text: '🇲🇦 العربية', callback_data: 'lang:set:ar' },
            ],
          ],
        };
        await this.bot.sendMessage(
          chatId,
          user.language === 'ar' ? 'اختر لغة التواصل مع الروبوت:' : 'Choisissez votre langue de communication :',
          { replyMarkup: kb }
        );
        break;
      }

      case '/pause': {
        await this.db.updateUserStatus(chatId, 'paused');
        await this.bot.sendMessage(chatId, dict.paused);
        break;
      }

      case '/resume': {
        await this.db.updateUserStatus(chatId, 'active');
        await this.bot.sendMessage(chatId, dict.resumed);
        break;
      }

      case '/search': {
        await this.handleManualSearch(user);
        break;
      }

      case '/delete_me': {
        const kb: InlineKeyboardMarkup = {
          inline_keyboard: [
            [
              { text: dict.btn_delete_confirm, callback_data: 'del:confirm' },
              { text: dict.btn_delete_cancel, callback_data: 'del:cancel' },
            ],
          ],
        };
        await this.bot.sendMessage(chatId, dict.delete_confirm_prompt, {
          replyMarkup: kb,
        });
        break;
      }

      default: {
        await this.bot.sendMessage(chatId, dict.help_text);
        break;
      }
    }
  }

  // 3. Callback Query Router (Button clicks)
  private async handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    const data = cb.data || '';
    const chatId = String(cb.message?.chat.id || cb.from.id);
    const messageId = cb.message?.message_id;

    await this.bot.answerCallbackQuery(cb.id);

    const user = await this.db.getOrCreateUser({
      chatId,
      userId: String(cb.from.id),
      username: cb.from.username || null,
      firstName: cb.from.first_name || null,
    });

    // Language selection
    if (data.startsWith('lang:set:')) {
      const newLang = data.split(':')[2] as Language;
      if (newLang === 'fr' || newLang === 'ar') {
        await this.db.updateUserLanguage(chatId, newLang);
        user.language = newLang;
        const dict = MESSAGES[newLang];
        await this.bot.sendMessage(
          chatId,
          newLang === 'ar' ? '✅ تم ضبط اللغة بنجاح: العربية' : '✅ Langue configurée : Français'
        );
        // If user was not onboarded yet or in edit mode, launch question 1
        await this.startOnboarding(user);
      }
      return;
    }

    // Deletion confirmation
    if (data === 'del:confirm') {
      const dict = MESSAGES[user.language];
      await this.db.deleteUserCompletely(chatId);
      if (messageId) {
        await this.bot.editMessageText(chatId, messageId, dict.deleted_success);
      } else {
        await this.bot.sendMessage(chatId, dict.deleted_success);
      }
      return;
    }

    if (data === 'del:cancel') {
      const dict = MESSAGES[user.language];
      if (messageId) {
        await this.bot.editMessageText(chatId, messageId, dict.delete_cancelled);
      } else {
        await this.bot.sendMessage(chatId, dict.delete_cancelled);
      }
      return;
    }

    // Conversational flow buttons
    const conv = await this.db.getConversationState(chatId);
    if (!conv) {
      // User might have pressed an old button after restart
      if (data.startsWith('edit:restart')) {
        await this.startOnboarding(user);
        return;
      }
      return;
    }

    await this.handleConversationCallback(data, conv.step, conv.data, user, messageId);
  }

  // 4. Conversational Step Logic
  public async startOnboarding(user: UserRecord): Promise<void> {
    const chatId = user.telegram_chat_id;
    const dict = MESSAGES[user.language];

    await this.db.updateOnboardingStatus(chatId, 'in_progress');

    // Initialize conversation state with empty or existing preferences
    const existingPrefs = await this.db.getUserPreferences(user.id);
    const initialData: Record<string, unknown> = {
      specialties: existingPrefs?.specialties || ['info_gen'],
      grades: existingPrefs?.grades || ['all'],
      custom_grade: existingPrefs?.custom_grade || '',
      locations: existingPrefs?.locations || ['all'],
      custom_location: existingPrefs?.custom_location || '',
      sector: existingPrefs?.sector || 'both',
      contract_type: existingPrefs?.contract_type || 'all',
      experience_level: existingPrefs?.experience_level || 'all',
    };

    await this.db.setConversationState(chatId, 'q_specialty', initialData);
    await this.sendSpecialtyQuestion(chatId, user.language, initialData.specialties as string[]);
  }

  private async sendSpecialtyQuestion(
    chatId: string,
    lang: Language,
    selected: string[],
    messageId?: number
  ): Promise<void> {
    const dict = MESSAGES[lang];
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];

    // 2 buttons per row
    for (let i = 0; i < SPECIALTY_OPTIONS.length; i += 2) {
      const r: InlineKeyboardMarkup['inline_keyboard'][0] = [];
      const item1 = SPECIALTY_OPTIONS[i];
      const isSel1 = selected.includes(item1.key);
      r.push({
        text: `${isSel1 ? '✅ ' : ''}${getLabel(SPECIALTY_OPTIONS, item1.key, lang)}`,
        callback_data: `spec:toggle:${item1.key}`,
      });

      if (i + 1 < SPECIALTY_OPTIONS.length) {
        const item2 = SPECIALTY_OPTIONS[i + 1];
        const isSel2 = selected.includes(item2.key);
        r.push({
          text: `${isSel2 ? '✅ ' : ''}${getLabel(SPECIALTY_OPTIONS, item2.key, lang)}`,
          callback_data: `spec:toggle:${item2.key}`,
        });
      }
      rows.push(r);
    }

    rows.push([
      {
        text: dict.btn_validate,
        callback_data: 'spec:done',
      },
    ]);

    if (messageId) {
      await this.bot.editMessageText(chatId, messageId, dict.q_specialty, {
        replyMarkup: { inline_keyboard: rows },
      });
    } else {
      await this.bot.sendMessage(chatId, dict.q_specialty, {
        replyMarkup: { inline_keyboard: rows },
      });
    }
  }

  private async sendGradeQuestion(
    chatId: string,
    lang: Language,
    selected: string[],
    messageId?: number
  ): Promise<void> {
    const dict = MESSAGES[lang];
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];

    // All grades option
    const isAll = selected.includes('all');
    rows.push([
      {
        text: `${isAll ? '✅ ' : ''}${lang === 'ar' ? '🌟 كل الرتب والمؤهلات' : '🌟 Tous les grades'}`,
        callback_data: 'grade:toggle:all',
      },
    ]);

    for (const opt of GRADE_OPTIONS) {
      const isSel = selected.includes(opt.key);
      rows.push([
        {
          text: `${isSel ? '✅ ' : ''}${getLabel(GRADE_OPTIONS, opt.key, lang)}`,
          callback_data: `grade:toggle:${opt.key}`,
        },
      ]);
    }

    rows.push([
      {
        text: dict.btn_validate,
        callback_data: 'grade:done',
      },
    ]);

    if (messageId) {
      await this.bot.editMessageText(chatId, messageId, dict.q_grade, {
        replyMarkup: { inline_keyboard: rows },
      });
    } else {
      await this.bot.sendMessage(chatId, dict.q_grade, {
        replyMarkup: { inline_keyboard: rows },
      });
    }
  }

  private async sendLocationQuestion(
    chatId: string,
    lang: Language,
    selected: string[],
    messageId?: number
  ): Promise<void> {
    const dict = MESSAGES[lang];
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];

    for (let i = 0; i < LOCATION_OPTIONS.length; i += 2) {
      const r: InlineKeyboardMarkup['inline_keyboard'][0] = [];
      const item1 = LOCATION_OPTIONS[i];
      const isSel1 = selected.includes(item1.key);
      r.push({
        text: `${isSel1 ? '✅ ' : ''}${getLabel(LOCATION_OPTIONS, item1.key, lang)}`,
        callback_data: `loc:select:${item1.key}`,
      });

      if (i + 1 < LOCATION_OPTIONS.length) {
        const item2 = LOCATION_OPTIONS[i + 1];
        const isSel2 = selected.includes(item2.key);
        r.push({
          text: `${isSel2 ? '✅ ' : ''}${getLabel(LOCATION_OPTIONS, item2.key, lang)}`,
          callback_data: `loc:select:${item2.key}`,
        });
      }
      rows.push(r);
    }

    rows.push([
      {
        text: dict.btn_skip,
        callback_data: 'loc:skip',
      },
    ]);

    if (messageId) {
      await this.bot.editMessageText(chatId, messageId, dict.q_location, {
        replyMarkup: { inline_keyboard: rows },
      });
    } else {
      await this.bot.sendMessage(chatId, dict.q_location, {
        replyMarkup: { inline_keyboard: rows },
      });
    }
  }

  private async sendSectorQuestion(
    chatId: string,
    lang: Language,
    messageId?: number
  ): Promise<void> {
    const dict = MESSAGES[lang];
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];

    for (const opt of SECTOR_OPTIONS) {
      rows.push([
        {
          text: getLabel(SECTOR_OPTIONS, opt.key, lang),
          callback_data: `sec:select:${opt.key}`,
        },
      ]);
    }

    rows.push([
      {
        text: dict.btn_skip,
        callback_data: 'sec:skip',
      },
    ]);

    if (messageId) {
      await this.bot.editMessageText(chatId, messageId, `${dict.q_optional_intro}\n\n${dict.q_sector}`, {
        replyMarkup: { inline_keyboard: rows },
      });
    } else {
      await this.bot.sendMessage(chatId, `${dict.q_optional_intro}\n\n${dict.q_sector}`, {
        replyMarkup: { inline_keyboard: rows },
      });
    }
  }

  private async sendSummaryConfirmation(
    chatId: string,
    lang: Language,
    data: Record<string, unknown>,
    messageId?: number
  ): Promise<void> {
    const dict = MESSAGES[lang];
    const summaryText = this.buildSummaryText(data, lang);

    const kb: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: dict.btn_confirm, callback_data: 'summary:confirm' },
        ],
        [
          { text: dict.btn_edit, callback_data: 'summary:edit' },
        ],
      ],
    };

    if (messageId) {
      await this.bot.editMessageText(chatId, messageId, summaryText, {
        replyMarkup: kb,
      });
    } else {
      await this.bot.sendMessage(chatId, summaryText, {
        replyMarkup: kb,
      });
    }
  }

  private buildSummaryText(data: Record<string, unknown>, lang: Language): string {
    const dict = MESSAGES[lang];
    const isAr = lang === 'ar';
    const lines: string[] = [dict.summary_title, ''];

    // Specialties
    const specs = (data.specialties as string[]) || [];
    const specLabels = specs
      .map((s) => getLabel(SPECIALTY_OPTIONS, s, lang))
      .join(', ');
    lines.push(`${isAr ? '💻 <b>التخصصات:</b>' : '💻 <b>Spécialités:</b>'} ${specLabels || (isAr ? 'الكل' : 'Toutes')}`);

    // Grades
    const grades = (data.grades as string[]) || [];
    const gradeLabels = grades
      .map((g) => (g === 'all' ? (isAr ? 'جميع الرتب' : 'Tous les grades') : getLabel(GRADE_OPTIONS, g, lang)))
      .join(', ');
    const customGrade = data.custom_grade ? ` (${data.custom_grade})` : '';
    lines.push(`${isAr ? '🎓 <b>الرتب والشهادات:</b>' : '🎓 <b>Grades:</b>'} ${gradeLabels}${customGrade}`);

    // Location
    const locs = (data.locations as string[]) || [];
    const locLabels = locs
      .map((l) => getLabel(LOCATION_OPTIONS, l, lang))
      .join(', ');
    const customLoc = data.custom_location ? ` (${data.custom_location})` : '';
    lines.push(`${isAr ? '📍 <b>الموقع:</b>' : '📍 <b>Localisation:</b>'} ${locLabels || (isAr ? 'كل المغرب' : 'Tout le Maroc')}${customLoc}`);

    // Sector
    const sec = (data.sector as string) || 'both';
    lines.push(`${isAr ? '🏢 <b>القطاع:</b>' : '🏢 <b>Secteur:</b>'} ${getLabel(SECTOR_OPTIONS, sec, lang)}`);

    return lines.join('\n');
  }

  private async handleConversationCallback(
    data: string,
    step: string,
    stateData: Record<string, unknown>,
    user: UserRecord,
    messageId?: number
  ): Promise<void> {
    const chatId = user.telegram_chat_id;
    const lang = user.language;
    const dict = MESSAGES[lang];

    // --- Step: Specialty ---
    if (step === 'q_specialty') {
      const selected = (stateData.specialties as string[]) || [];
      if (data.startsWith('spec:toggle:')) {
        const key = data.split(':')[2];
        const nextSelected = selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key];

        stateData.specialties = nextSelected.length > 0 ? nextSelected : ['info_gen'];
        await this.db.setConversationState(chatId, 'q_specialty', stateData);
        await this.sendSpecialtyQuestion(chatId, lang, stateData.specialties as string[], messageId);
        return;
      }

      if (data === 'spec:done') {
        // Advance to Question 2: Grade
        await this.db.setConversationState(chatId, 'q_grade', stateData);
        await this.sendGradeQuestion(chatId, lang, (stateData.grades as string[]) || ['all'], messageId);
        return;
      }
    }

    // --- Step: Grade ---
    if (step === 'q_grade') {
      const selected = (stateData.grades as string[]) || [];

      if (data === 'grade:toggle:all') {
        stateData.grades = ['all'];
        await this.db.setConversationState(chatId, 'q_grade', stateData);
        await this.sendGradeQuestion(chatId, lang, stateData.grades as string[], messageId);
        return;
      }

      if (data.startsWith('grade:toggle:')) {
        const key = data.split(':')[2];
        if (key === 'autre') {
          // Switch to custom text input
          await this.db.setConversationState(chatId, 'q_grade_custom', stateData);
          await this.bot.sendMessage(chatId, dict.q_grade_custom_prompt);
          return;
        }

        let nextSelected = selected.filter((k) => k !== 'all');
        nextSelected = nextSelected.includes(key)
          ? nextSelected.filter((k) => k !== key)
          : [...nextSelected, key];

        stateData.grades = nextSelected.length > 0 ? nextSelected : ['all'];
        await this.db.setConversationState(chatId, 'q_grade', stateData);
        await this.sendGradeQuestion(chatId, lang, stateData.grades as string[], messageId);
        return;
      }

      if (data === 'grade:done') {
        // Advance to Question 3: Location
        await this.db.setConversationState(chatId, 'q_location', stateData);
        await this.sendLocationQuestion(chatId, lang, (stateData.locations as string[]) || ['all'], messageId);
        return;
      }
    }

    // --- Step: Location ---
    if (step === 'q_location') {
      if (data === 'loc:skip') {
        stateData.locations = ['all'];
        await this.db.setConversationState(chatId, 'q_sector', stateData);
        await this.sendSectorQuestion(chatId, lang, messageId);
        return;
      }

      if (data.startsWith('loc:select:')) {
        const key = data.split(':')[2];
        if (key === 'autre') {
          await this.db.setConversationState(chatId, 'q_location_custom', stateData);
          await this.bot.sendMessage(chatId, dict.q_location_custom_prompt);
          return;
        }

        stateData.locations = [key];
        await this.db.setConversationState(chatId, 'q_sector', stateData);
        await this.sendSectorQuestion(chatId, lang, messageId);
        return;
      }
    }

    // --- Step: Sector ---
    if (step === 'q_sector') {
      if (data.startsWith('sec:select:')) {
        stateData.sector = data.split(':')[2];
      } else if (data === 'sec:skip') {
        stateData.sector = 'both';
      }

      // Done with questions -> Show summary
      await this.db.setConversationState(chatId, 'q_summary', stateData);
      await this.sendSummaryConfirmation(chatId, lang, stateData, messageId);
      return;
    }

    // --- Step: Summary & Confirmation ---
    if (step === 'q_summary') {
      if (data === 'summary:confirm') {
        // Persist preferences into D1
        await this.db.saveUserPreferences(user.id, {
          specialties: stateData.specialties as string[],
          grades: stateData.grades as string[],
          custom_grade: (stateData.custom_grade as string) || null,
          locations: stateData.locations as string[],
          custom_location: (stateData.custom_location as string) || null,
          sector: (stateData.sector as any) || 'both',
          contract_type: (stateData.contract_type as string) || 'all',
          experience_level: (stateData.experience_level as string) || 'all',
        });

        await this.db.updateOnboardingStatus(chatId, 'completed');
        await this.db.clearConversationState(chatId);

        if (messageId) {
          await this.bot.editMessageText(chatId, messageId, dict.onboarding_completed);
        } else {
          await this.bot.sendMessage(chatId, dict.onboarding_completed);
        }
        return;
      }

      if (data === 'summary:edit') {
        await this.startOnboarding(user);
        return;
      }
    }
  }

  private async handleConversationInput(
    step: string,
    stateData: Record<string, unknown>,
    text: string,
    user: UserRecord
  ): Promise<void> {
    const chatId = user.telegram_chat_id;
    const lang = user.language;

    if (step === 'q_grade_custom') {
      stateData.custom_grade = text.trim();
      const curGrades = (stateData.grades as string[]) || [];
      if (!curGrades.includes('autre')) curGrades.push('autre');
      stateData.grades = curGrades;

      // Advance to location
      await this.db.setConversationState(chatId, 'q_location', stateData);
      await this.sendLocationQuestion(chatId, lang, (stateData.locations as string[]) || ['all']);
      return;
    }

    if (step === 'q_location_custom') {
      stateData.custom_location = text.trim();
      stateData.locations = ['autre'];

      // Advance to sector
      await this.db.setConversationState(chatId, 'q_sector', stateData);
      await this.sendSectorQuestion(chatId, lang);
      return;
    }
  }

  // 5. Profile Viewer
  private async sendProfileView(user: UserRecord): Promise<void> {
    const chatId = user.telegram_chat_id;
    const lang = user.language;
    const dict = MESSAGES[lang];
    const prefs = await this.db.getUserPreferences(user.id);

    if (!prefs) {
      await this.bot.sendMessage(chatId, dict.welcome);
      return;
    }

    const summaryText = this.buildSummaryText(
      {
        specialties: prefs.specialties,
        grades: prefs.grades,
        custom_grade: prefs.custom_grade,
        locations: prefs.locations,
        custom_location: prefs.custom_location,
        sector: prefs.sector,
      },
      lang
    );

    const isPaused = user.status === 'paused';
    const statusNote = isPaused
      ? (lang === 'ar' ? '\n⚠️ <i>حسابك متوقف حالياً عن استقبال الإشعارات اليومية (/resume)</i>' : '\n⚠️ <i>Vos notifications sont actuellement en pause (/resume)</i>')
      : (lang === 'ar' ? '\n✅ <i>الإشعارات اليومية مفعلة</i>' : '\n✅ <i>Notifications quotidiennes actives</i>');

    const kb: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: dict.btn_edit, callback_data: 'summary:edit' },
          { text: isPaused ? '▶️ Resume' : '⏸️ Pause', callback_data: isPaused ? 'cmd:resume' : 'cmd:pause' },
        ],
      ],
    };

    await this.bot.sendMessage(chatId, `${summaryText}${statusNote}`, {
      replyMarkup: kb,
    });
  }

  // 6. Manual Instant Search
  private async handleManualSearch(user: UserRecord): Promise<void> {
    const chatId = user.telegram_chat_id;
    const lang = user.language;
    const dict = MESSAGES[lang];

    // Check rate limit: 5 requests per 60 seconds
    const rateCheck = await this.db.checkRateLimit(`search:${chatId}`, this.rateLimitMax, 60000);
    if (!rateCheck.allowed) {
      await this.bot.sendMessage(chatId, dict.rate_limited);
      return;
    }

    const prefs = await this.db.getUserPreferences(user.id);
    if (!prefs) {
      await this.bot.sendMessage(chatId, dict.welcome);
      return;
    }

    // Get recent jobs from D1
    const announcements = await this.db.getRecentAnnouncements(25);
    const matches = announcements.filter((job) => matchJobToUser(job, prefs).matches);

    if (matches.length === 0) {
      await this.bot.sendMessage(chatId, dict.no_search_results);
      return;
    }

    const digestChunks = formatDailyDigest(matches.slice(0, 5), lang);
    for (const chunk of digestChunks) {
      await this.bot.sendMessage(chatId, chunk);
    }
  }
}
