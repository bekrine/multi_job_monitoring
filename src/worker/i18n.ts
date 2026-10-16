/**
 * Internationalization and localization module for Morocco IT Job Monitoring Bot.
 * Provides complete French (fr) and Arabic (ar) strings, button labels, and templates.
 */

import { Language } from './types.ts';

export interface OptionItem {
  key: string;
  labelFr: string;
  labelAr: string;
}

export const SPECIALTY_OPTIONS: OptionItem[] = [
  { key: 'info_gen', labelFr: '💻 Informatique générale', labelAr: '💻 معلوميات عامة' },
  { key: 'dev_logiciel', labelFr: '⚙️ Développement logiciel', labelAr: '⚙️ تطوير البرمجيات' },
  { key: 'dev_web', labelFr: '🌐 Développement web', labelAr: '🌐 تطوير الويب' },
  { key: 'reseaux_sys', labelFr: '📡 Réseaux et systèmes', labelAr: '📡 الشبكات والأنظمة' },
  { key: 'cybersecurite', labelFr: '🛡️ Cybersécurité', labelAr: '🛡️ الأمن السيبراني' },
  { key: 'data_ai', labelFr: '📊 Data et IA', labelAr: '📊 البيانات والذكاء الاصطناعي' },
  { key: 'support_it', labelFr: '🛠️ Support informatique', labelAr: '🛠️ الدعم الفني للمعلوميات' },
  { key: 'qa_testing', labelFr: '🧪 Test et QA', labelAr: '🧪 اختبار الجودة البرمجية' },
  { key: 'devops_cloud', labelFr: '☁️ DevOps et Cloud', labelAr: '☁️ الحوسبة السحابية وDevOps' },
  { key: 'autre', labelFr: '➕ Autre spécialité', labelAr: '➕ تخصص آخر' },
];

export const GRADE_OPTIONS: OptionItem[] = [
  { key: 'tech_3', labelFr: '📜 Technicien 3ème grade (Échelle 9)', labelAr: '📜 تقني الدرجة 3 (سلم 9)' },
  { key: 'tech_4', labelFr: '📜 Technicien 4ème grade (Échelle 8)', labelAr: '📜 تقني الدرجة 4 (سلم 8)' },
  { key: 'tech_spe', labelFr: '🎓 Technicien spécialisé (DTS / DUT / BTS)', labelAr: '🎓 تقني متخصص (DTS/DUT/BTS)' },
  { key: 'tech', labelFr: '🎓 Technicien (DT)', labelAr: '🎓 تقني (DT)' },
  { key: 'ingenieur', labelFr: '🎖️ Ingénieur d\'État (Échelle 11)', labelAr: '🎖️ مهندس دولة (سلم 11)' },
  { key: 'admin', labelFr: '📋 Administrateur (2e / 3e grade)', labelAr: '📋 متصرف (الدرجة 2 أو 3)' },
  { key: 'autre', labelFr: '✍️ Autre grade (saisie libre)', labelAr: '✍️ رتبة أخرى (كتابة مخصصة)' },
];

export const LOCATION_OPTIONS: OptionItem[] = [
  { key: 'all', labelFr: '🇲🇦 Tout le Maroc', labelAr: '🇲🇦 كل ربوع المملكة' },
  { key: 'casablanca', labelFr: '🏙️ Casablanca-Settat', labelAr: '🏙️ الدار البيضاء - سطات' },
  { key: 'rabat', labelFr: '🏛️ Rabat-Salé-Kénitra', labelAr: '🏛️ الرباط - سلا - القنيطرة' },
  { key: 'tanger', labelFr: '🌊 Tanger-Tétouan-Al Hoceïma', labelAr: '🌊 طنجة - تطوان - الحسيمة' },
  { key: 'marrakech', labelFr: '🌴 Marrakech-Safi', labelAr: '🌴 مراكش - آسفي' },
  { key: 'fes', labelFr: '🕌 Fès-Meknès', labelAr: '🕌 فاس - مكناس' },
  { key: 'oriental', labelFr: '⛰️ L\'Oriental (Oujda)', labelAr: '⛰️ الجهة الشرقية (وجدة)' },
  { key: 'souss', labelFr: '☀️ Souss-Massa (Agadir)', labelAr: '☀️ سوس - ماسة (أكادير)' },
  { key: 'autre', labelFr: '📍 Autre ville', labelAr: '📍 مدينة أخرى' },
];

export const SECTOR_OPTIONS: OptionItem[] = [
  { key: 'both', labelFr: '🤝 Public et Privé', labelAr: '🤝 القطاع العام والخاص' },
  { key: 'public', labelFr: '🏛️ Secteur Public uniquement', labelAr: '🏛️ القطاع العام فقط' },
  { key: 'private', labelFr: '🏢 Secteur Privé uniquement', labelAr: '🏢 القطاع الخاص فقط' },
];

export const CONTRACT_OPTIONS: OptionItem[] = [
  { key: 'all', labelFr: '📑 Tous types de contrats', labelAr: '📑 جميع أنواع العقود' },
  { key: 'fonction_publique', labelFr: '🏛️ Titulaire Fonction Publique', labelAr: '🏛️ توظيف في الوظيفة العمومية' },
  { key: 'cdi', labelFr: '💼 Contrat CDI', labelAr: '💼 عقد غير محدد المدة CDI' },
  { key: 'cdd_anapec', labelFr: '📝 CDD / ANAPEC', labelAr: '📝 عقد محدد المدة / أنابيك' },
];

export const EXPERIENCE_OPTIONS: OptionItem[] = [
  { key: 'all', labelFr: '👥 Tous niveaux', labelAr: '👥 جميع المستويات' },
  { key: 'junior', labelFr: '🌱 Junior / Débutant (0 - 2 ans)', labelAr: '🌱 مبتدئ / خريج جديد (0 - 2 سنوات)' },
  { key: 'mid_senior', labelFr: '🚀 Confirmé / Senior (3+ ans)', labelAr: '🚀 متمرس / ذو خبرة (3+ سنوات)' },
];

export const MESSAGES = {
  fr: {
    welcome: '🇲🇦 Bienvenue sur le service de veille pour l\'emploi IT au Maroc ! Choisissez votre langue :',
    onboarding_start: '🎯 <b>Configuration de vos critères de recherche IT</b>\n\nNous allons personnaliser les offres d\'emploi et concours que vous recevrez chaque jour.',
    q_specialty: '💻 <b>Question 1/3 : Spécialité(s) recherchée(s)</b>\n\nSélectionnez une ou plusieurs spécialités. Cliquez sur "✅ Valider la sélection" une fois terminé :',
    q_grade: '🎓 <b>Question 2/3 : Grade / Diplôme / Qualification</b>\n\nSélectionnez vos grades cibles (ex: Technicien 3ème grade, DTS, Ingénieur). Cliquez sur "✅ Valider" :',
    q_grade_custom_prompt: '✍️ Veuillez taper votre grade ou diplôme en réponse à ce message :',
    q_location: '📍 <b>Question 3/3 : Localisation géographique</b>\n\nOù souhaitez-vous travailler au Maroc ?',
    q_location_custom_prompt: '✍️ Veuillez écrire le nom de votre ville ou région :',
    q_optional_intro: '✨ <b>Filtres optionnels</b>\n\nVous pouvez affiner par secteur d\'activité, contrat et expérience (ou passer directement) :',
    q_sector: '🏢 <b>Secteur souhaité :</b>',
    q_contract: '📑 <b>Type de contrat souhaité :</b>',
    q_experience: '⏳ <b>Niveau d\'expérience :</b>',
    btn_validate: '✅ Valider la sélection',
    btn_skip: '⏭️ Passer cette étape',
    btn_edit: '✏️ Modifier mes préférences',
    btn_confirm: '🎉 Confirmer et Activer les alertes',
    summary_title: '📋 <b>Résumé de vos préférences de recherche :</b>',
    onboarding_completed: '✅ <b>Félicitations ! Vos alertes quotidiennes sont désormais actives.</b>\n\nVous recevrez chaque matin un récapitulatif des concours et opportunités IT au Maroc correspondant à votre profil.\n\nUtilisez /help à tout moment pour gérer vos options.',
    help_text: `🤖 <b>Guide d'utilisation du Bot Emploi IT Maroc</b>

Voici les commandes disponibles :
/start - Relancer l'accueil ou la configuration
/profile - Consulter vos préférences enregistrées
/edit - Mettre à jour vos critères de recherche
/language - Changer de langue (Français / العربية)
/search - Rechercher immédiatement des offres récentes
/pause - Mettre en pause temporairement vos alertes
/resume - Réactiver vos alertes quotidiennes
/delete_me - Supprimer votre profil et données personnelles
/help - Afficher cette aide`,
    paused: '⏸️ <b>Vos alertes quotidiennes sont désormais en pause.</b>\nUtilisez /resume pour les réactiver quand vous le souhaitez.',
    resumed: '▶️ <b>Vos alertes quotidiennes sont de nouveau actives !</b>',
    delete_confirm_prompt: '⚠️ <b>Confirmation de suppression</b>\n\nÊtes-vous sûr de vouloir supprimer définitivement votre compte, vos préférences et l\'historique de notifications ? Cette action est irréversible.',
    btn_delete_confirm: '🗑️ Oui, supprimer mon compte',
    btn_delete_cancel: '❌ Annuler',
    deleted_success: '👋 Votre compte et toutes vos données ont été définitivement supprimés. Vous pouvez revenir à tout moment avec /start.',
    delete_cancelled: '👌 Suppression annulée. Votre compte reste actif.',
    rate_limited: '⏳ Vous effectuez trop de requêtes manuelles. Veuillez patienter une minute avant de réessayer.',
    no_search_results: '🔍 Aucune opportunité active ne correspond à vos filtres pour le moment. Nous continuons à surveiller les nouveaux concours chaque jour !',
    search_header: '🔍 <b>Résultats récents pour votre profil :</b>',
    digest_header: '📬 <b>Votre récapitulatif quotidien Emploi IT Maroc</b>',
    digest_footer: '🔔 <i>Ces opportunités correspondent à vos critères. Pour modifier vos filtres, tapez /edit.</i>',
    error_generic: 'Une erreur s\'est produite. Veuillez réessayer dans quelques instants.',
  },
  ar: {
    welcome: '🇲🇦 مرحباً بك في خدمة متابعة مباريات ووظائف تكنولوجيا المعلومات في المغرب! اختر لغتك المفضلة:',
    onboarding_start: '🎯 <b>إعداد معايير البحث عن وظائف المعلوميات</b>\n\nسنقوم بتخصيص إعلانات المباريات والوظائف اليومية لتناسب مؤهلاتك ورغباتك.',
    q_specialty: '💻 <b>السؤال 1/3: التخصص أو التخصصات المطلوبة</b>\n\nاختر تخصصاً أو أكثر، ثم اضغط على "✅ تأكيد الاختيار" عند الانتهاء:',
    q_grade: '🎓 <b>السؤال 2/3: الرتبة / الدرجة / الشهادة</b>\n\nاختر الدرجة أو الإطار المناسب لمؤهلاتك (مثل: تقني الدرجة 3، تقني متخصص، مهندس دولة):',
    q_grade_custom_prompt: '✍️ الرجاء كتابة اسم الدرجة أو الدبلوم في رسالة جوابية:',
    q_location: '📍 <b>السؤال 3/3: الموقع الجغرافي</b>\n\nأين تفضل العمل في المغرب؟',
    q_location_custom_prompt: '✍️ الرجاء كتابة اسم المدينة أو الجهة:',
    q_optional_intro: '✨ <b>معايير اختيارية إضافية</b>\n\nيمكنك تخصيص القطاع ونوع العقد والخبرة (أو تجاوز هذه المرحلة):',
    q_sector: '🏢 <b>القطاع المرغوب:</b>',
    q_contract: '📑 <b>نوع العقد:</b>',
    q_experience: '⏳ <b>مستوى الخبرة:</b>',
    btn_validate: '✅ تأكيد الاختيار',
    btn_skip: '⏭️ تخطي هذه المرحلة',
    btn_edit: '✏️ تعديل المعايير',
    btn_confirm: '🎉 تأكيد وتفعيل التنبيهات',
    summary_title: '📋 <b>ملخص معايير البحث الخاصة بك:</b>',
    onboarding_completed: '✅ <b>تهانينا! تم تفعيل إشعاراتك اليومية بنجاح.</b>\n\nستتوصل صباح كل يوم بتقرير مخصص يضم أحدث مباريات القطاع العام وفرص تكنولوجيا المعلومات بالمغرب المطابقة لملفك.\n\nاستخدم الأمر /help في أي وقت لإدارة خياراتك.',
    help_text: `🤖 <b>دليل استخدام روبوت وظائف المعلوميات بالمغرب</b>

الأوامر المتاحة:
/start - بدء التشغيل أو إعادة ضبط المعايير
/profile - عرض معايير البحث المسجلة لديك
/edit - تعديل التخصصات والدرجات والمواقع
/language - تغيير اللغة (Français / العربية)
/search - بحث فوري عن أحدث الإعلانات المطابقة
/pause - إيقاف مؤقت للإشعارات اليومية
/resume - إعادة تفعيل الإشعارات
/delete_me - حذف حسابك وبياناتك الشخصية نهائياً
/help - إظهار رسالة المساعدة`,
    paused: '⏸️ <b>تم إيقاف التنبيهات اليومية مؤقتاً.</b>\nاستخدم الأمر /resume لإعادة تفعيلها في أي وقت.',
    resumed: '▶️ <b>تمت إعادة تفعيل التنبيهات اليومية بنجاح!</b>',
    delete_confirm_prompt: '⚠️ <b>تأكيد حذف الحساب</b>\n\nهل أنت متأكد من رغبتك في حذف ملفك الشخصي وكافة بياناتك وسجل التنبيهات؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.',
    btn_delete_confirm: '🗑️ نعم، احذف حسابي',
    btn_delete_cancel: '❌ إلغاء',
    deleted_success: '👋 تم حذف حسابك وكافة بياناتك الشخصية نهائياً. يمكنك العودة والاشتراك مجدداً في أي وقت عبر الأمر /start.',
    delete_cancelled: '👌 تم إلغاء عملية الحذف. حسابك لا يزال نشطاً.',
    rate_limited: '⏳ لقد قمت بعدد كبير من طلبات البحث. يُرجى الانتظار دقيقة واحدة قبل المحاولة مجدداً.',
    no_search_results: '🔍 لا توجد حالياً مباريات نشطة تطابق معاييرك بالضبط. نقوم بفحص البوابات وإضافة الفرص الجديدة يومياً!',
    search_header: '🔍 <b>أحدث المباريات المطابقة لملفك:</b>',
    digest_header: '📬 <b>تقريرك اليومي - مباريات وفرص تكنولوجيا المعلومات بالمغرب</b>',
    digest_footer: '🔔 <i>هذه الفرص متوافقة مع اختياراتك. لتغيير المعايير اكتب /edit.</i>',
    error_generic: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  },
};

export function getLabel(options: OptionItem[], key: string, lang: Language): string {
  const item = options.find((o) => o.key === key);
  if (!item) return key;
  return lang === 'ar' ? item.labelAr : item.labelFr;
}
