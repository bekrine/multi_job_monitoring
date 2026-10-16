/**
 * Matching engine for Morocco IT Job Monitoring service.
 * Deterministically evaluates job announcements against user preferences
 * (specialties, grades, locations, sectors, experience, and contracts).
 */

import { IngestJobPayload, UserPreferences } from './types.ts';

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[ـَُِّْ]/g, '') // remove Arabic tashkeel / tatweel
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  info_gen: [
    'informatique',
    'systeme d information',
    'systemes d information',
    'it',
    'معلوميات',
    'المعلوميات',
    'إعلاميات',
    'تكنولوجيا المعلومات',
    'علوم الحاسوب',
  ],
  dev_logiciel: [
    'developpement',
    'developpeur',
    'logiciel',
    'software',
    'fullstack',
    'front-end',
    'back-end',
    'backend',
    'frontend',
    'java',
    'python',
    'react',
    'node',
    'angular',
    'spring',
    'تطوير',
    'برمجيات',
    'مبرمج',
    'هندسة البرمجيات',
    'تطوير المعلوميات',
  ],
  dev_web: [
    'web',
    'developpeur web',
    'developpement web',
    'php',
    'laravel',
    'wordpress',
    'html',
    'css',
    'javascript',
    'تطوير الويب',
    'مواقع الويب',
  ],
  reseaux_sys: [
    'reseau',
    'reseaux',
    'systeme',
    'systemes',
    'telecom',
    'telecommunications',
    'cisco',
    'linux',
    'windows server',
    'virtualisation',
    'الشبكات',
    'الأنظمة',
    'الاتصالات',
    'شبكات المعلوميات',
  ],
  cybersecurite: [
    'cybersecurite',
    'securite informatique',
    'securite des systemes',
    'security',
    'soc',
    'pentest',
    'cryptographie',
    'الأمن السيبراني',
    'أمن الأنظمة',
    'أمن المعلومات',
  ],
  data_ai: [
    'data',
    'donnees',
    'intelligence artificielle',
    'ia',
    'ai',
    'machine learning',
    'deep learning',
    'big data',
    'bi',
    'business intelligence',
    'data scientist',
    'data engineer',
    'بيانات',
    'علم البيانات',
    'البيانات الضخمة',
    'الذكاء الاصطناعي',
  ],
  support_it: [
    'support',
    'maintenance informatique',
    'helpdesk',
    'technicien support',
    'parc informatique',
    'assistance utilisateur',
    'صيانة المعلوميات',
    'الدعم الفني',
  ],
  qa_testing: [
    'test',
    'testing',
    'assurance qualite',
    'qa',
    'recette',
    'testeur',
    'automatisation des tests',
    'اختبار',
    'ضمان الجودة',
  ],
  devops_cloud: [
    'devops',
    'cloud',
    'aws',
    'azure',
    'gcp',
    'docker',
    'kubernetes',
    'ci cd',
    'terraform',
    'الحوسبة السحابية',
  ],
};

const GRADE_KEYWORDS: Record<string, string[]> = {
  tech_3: [
    'technicien de 3eme grade',
    'technicien 3eme grade',
    'technicien de 3e grade',
    'technicien 3e grade',
    'echelle 9',
    'echelle9',
    'سلم 9',
    'سلم9',
    'تقني من الدرجة الثالثة',
    'تقني الدرجة الثالثة',
  ],
  tech_4: [
    'technicien de 4eme grade',
    'technicien 4eme grade',
    'technicien 4e grade',
    'echelle 8',
    'echelle8',
    'سلم 8',
    'سلم8',
    'تقني من الدرجة الرابعة',
    'تقني الدرجة الرابعة',
  ],
  tech_spe: [
    'technicien specialise',
    'dts',
    'dut',
    'bts',
    'deust',
    'bac 2',
    'bac+2',
    'تقني متخصص',
    'شهادة التقني العالي',
  ],
  tech: [
    'technicien',
    'dt',
    'تقني',
    'مساعد تقني',
  ],
  ingenieur: [
    'ingenieur',
    'ingenieur d etat',
    'echelle 11',
    'echelle11',
    'سلم 11',
    'سلم11',
    'مهندس',
    'مهندس دولة',
    'master',
    'bac 5',
    'bac+5',
  ],
  admin: [
    'administrateur',
    'متصرف',
    'متصرف من الدرجة',
    'echelle 10',
    'سلم 10',
  ],
};

const LOCATION_KEYWORDS: Record<string, string[]> = {
  casablanca: ['casablanca', 'settat', 'mohammedia', 'berrechid', 'الدار البيضاء', 'سطات', 'المحمدية'],
  rabat: ['rabat', 'sale', 'kenitra', 'temara', 'khemisset', 'الرباط', 'سلا', 'القنيطرة', 'تمارة'],
  tanger: ['tanger', 'tetouan', 'hoceima', 'larache', 'طنجة', 'تطوان', 'الحسيمة', 'العرائش'],
  marrakech: ['marrakech', 'safi', 'essaouira', 'مراكش', 'آسفي', 'الصويرة'],
  fes: ['fes', 'meknes', 'taza', 'فاس', 'مكناس', 'تازة'],
  oriental: ['oujda', 'nador', 'berkane', 'oriental', 'وجدة', 'الناظور', 'بركان'],
  souss: ['agadir', 'tiznit', 'taroudant', 'souss', 'أكادير', 'تيزنيت', 'تارودانت', 'سوس'],
};

export interface MatchResult {
  matches: boolean;
  score: number;
  matchedSpecialties: string[];
  matchedGrades: string[];
  matchedLocation: boolean;
  reasons: string[];
}

/**
 * Checks if a job announcement matches a user's preferences.
 */
export function matchJobToUser(
  job: IngestJobPayload,
  prefs: UserPreferences
): MatchResult {
  const haystack = normalize(
    `${job.title} ${job.employer} ${job.location} ${job.specialite || ''} ${job.grade || ''} ${job.description}`
  );

  const reasons: string[] = [];
  let score = 50;

  // 1. Specialty matching
  const matchedSpecialties: string[] = [];
  const userSpecialties = prefs.specialties || ['info_gen'];

  // Check if user selected "info_gen" (broad IT matching)
  if (userSpecialties.includes('info_gen')) {
    matchedSpecialties.push('info_gen');
    reasons.push('Correspondance informatique générale');
    score += 20;
  } else {
    for (const specKey of userSpecialties) {
      if (specKey === 'autre') continue;
      const kwList = SPECIALTY_KEYWORDS[specKey] || [];
      const hasMatch = kwList.some((kw) => haystack.includes(normalize(kw)));
      if (hasMatch) {
        matchedSpecialties.push(specKey);
        score += 20;
      }
    }

    if (matchedSpecialties.length === 0) {
      // If none of the specific specialties matched
      return {
        matches: false,
        score: 0,
        matchedSpecialties: [],
        matchedGrades: [],
        matchedLocation: false,
        reasons: ['Aucune spécialité sélectionnée ne correspond'],
      };
    }
    reasons.push(`Spécialités correspondantes: ${matchedSpecialties.join(', ')}`);
  }

  // 2. Grade matching
  const matchedGrades: string[] = [];
  const userGrades = prefs.grades || ['all'];

  if (userGrades.includes('all')) {
    matchedGrades.push('all');
    reasons.push('Tous les grades acceptés');
    score += 15;
  } else {
    for (const gradeKey of userGrades) {
      if (gradeKey === 'autre') continue;
      const gradeKws = GRADE_KEYWORDS[gradeKey] || [];
      const hasMatch = gradeKws.some((kw) => haystack.includes(normalize(kw)));
      if (hasMatch) {
        matchedGrades.push(gradeKey);
        score += 25;
      }
    }

    // Check custom grade text if entered by user
    if (prefs.custom_grade && prefs.custom_grade.trim()) {
      const customNorm = normalize(prefs.custom_grade);
      if (customNorm && haystack.includes(customNorm)) {
        matchedGrades.push(`custom:${prefs.custom_grade}`);
        score += 30;
      }
    }

    // If job does not explicitly restrict grade and user chose technicien_specialise or ingenieur,
    // evaluate if job title indicates IT
    if (matchedGrades.length === 0) {
      // If the job announcement has an explicit grade that conflicts, exclude it.
      // E.g. user wants tech_3, but the announcement is explicitly for "ingenieur 1er grade" or "ouvrier"
      const isIngenieurJob = GRADE_KEYWORDS.ingenieur.some((kw) => haystack.includes(normalize(kw)));
      const isTech3Job = GRADE_KEYWORDS.tech_3.some((kw) => haystack.includes(normalize(kw)));
      const isTech4Job = GRADE_KEYWORDS.tech_4.some((kw) => haystack.includes(normalize(kw)));

      // If user only wanted tech_3 and it's an ingenieur job, reject
      if (userGrades.includes('tech_3') && !userGrades.includes('ingenieur') && isIngenieurJob) {
        return {
          matches: false,
          score: 0,
          matchedSpecialties,
          matchedGrades: [],
          matchedLocation: false,
          reasons: ['Grade non conforme (Réservé aux Ingénieurs)'],
        };
      }

      // If user only wanted ingenieur and it's a tech 4 job, reject
      if (userGrades.includes('ingenieur') && !userGrades.includes('tech_4') && isTech4Job && !isIngenieurJob) {
        return {
          matches: false,
          score: 0,
          matchedSpecialties,
          matchedGrades: [],
          matchedLocation: false,
          reasons: ['Grade non conforme (Réservé aux Techniciens 4e grade)'],
        };
      }

      // If no explicit public grade was specified in the job posting (e.g. private sector developer role)
      if (!isIngenieurJob && !isTech3Job && !isTech4Job) {
        matchedGrades.push('generic_it');
        reasons.push('Poste ouvert ou grade non spécifié');
        score += 10;
      } else {
        return {
          matches: false,
          score: 0,
          matchedSpecialties,
          matchedGrades: [],
          matchedLocation: false,
          reasons: ['Grade ne correspond pas aux critères de l\'utilisateur'],
        };
      }
    }
  }

  // 3. Location matching
  const userLocations = prefs.locations || ['all'];
  let matchedLocation = false;

  if (userLocations.includes('all')) {
    matchedLocation = true;
    reasons.push('Localisation: Tout le Maroc');
    score += 15;
  } else {
    for (const locKey of userLocations) {
      if (locKey === 'all') {
        matchedLocation = true;
        break;
      }
      if (locKey === 'autre') continue;
      const locKws = LOCATION_KEYWORDS[locKey] || [];
      if (locKws.some((kw) => haystack.includes(normalize(kw)))) {
        matchedLocation = true;
        score += 20;
        reasons.push(`Ville/Région correspondante: ${locKey}`);
        break;
      }
    }

    if (!matchedLocation && prefs.custom_location && prefs.custom_location.trim()) {
      const customLocNorm = normalize(prefs.custom_location);
      if (customLocNorm && haystack.includes(customLocNorm)) {
        matchedLocation = true;
        score += 20;
        reasons.push(`Ville personnalisée correspondante: ${prefs.custom_location}`);
      }
    }

    // Notice: If job has generic location like "Morocco", "Rabat ou tout le Maroc", or is empty,
    // we do not unfairly discard it if user has specific cities, but give a smaller score
    if (!matchedLocation) {
      const genericLocations = ['maroc', 'tout le maroc', 'maroc entier', 'المغرب', 'كل المغرب', 'national'];
      if (genericLocations.some((g) => haystack.includes(g)) || !job.location || job.location === 'Morocco') {
        matchedLocation = true;
        reasons.push('Offre nationale / Localisation multi-sites');
        score += 10;
      }
    }

    if (!matchedLocation) {
      return {
        matches: false,
        score: 0,
        matchedSpecialties,
        matchedGrades,
        matchedLocation: false,
        reasons: ['Localisation géographique non couverte'],
      };
    }
  }

  // 4. Sector matching
  if (prefs.sector && prefs.sector !== 'both') {
    const isPublic =
      haystack.includes('ministere') ||
      haystack.includes('commune') ||
      haystack.includes('emploi public') ||
      haystack.includes('concours') ||
      haystack.includes('مباراة') ||
      haystack.includes('وزارة') ||
      haystack.includes('جماعة') ||
      job.source === 'emploi-public.ma';

    if (prefs.sector === 'public' && !isPublic) {
      return {
        matches: false,
        score: 0,
        matchedSpecialties,
        matchedGrades,
        matchedLocation,
        reasons: ['Secteur privé exclu par l\'utilisateur'],
      };
    }

    if (prefs.sector === 'private' && isPublic) {
      return {
        matches: false,
        score: 0,
        matchedSpecialties,
        matchedGrades,
        matchedLocation,
        reasons: ['Secteur public exclu par l\'utilisateur'],
      };
    }
  }

  return {
    matches: true,
    score: Math.min(100, score),
    matchedSpecialties,
    matchedGrades,
    matchedLocation,
    reasons,
  };
}
