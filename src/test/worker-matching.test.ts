import { describe, it, expect } from 'vitest';
import { matchJobToUser } from '../worker/matching.ts';
import { IngestJobPayload, UserPreferences } from '../worker/types.ts';

describe('Cloudflare Worker - Matching Engine Rules', () => {
  const baseJob: IngestJobPayload = {
    id: 'concours-it-01',
    source: 'emploi-public.ma',
    title: 'مباراة لتوظيف تقني من الدرجة الثالثة سلم 9 تخصص تكنولوجيا المعلومات والشبكات',
    employer: 'Ministère de la Transition Numérique et de la Réforme de l\'Administration',
    location: 'Rabat',
    url: 'https://www.emploi-public.ma/ar/concours/101',
    grade: 'Technicien 3ème grade',
    specialite: 'Informatique et Réseaux',
    description: 'Concours de recrutement pour techniciens de 3ème grade échelle 9 en informatique et réseaux.',
  };

  it('matches when user selects info_gen and all grades', () => {
    const prefs: UserPreferences = {
      user_id: 1,
      specialties: ['info_gen'],
      grades: ['all'],
      locations: ['all'],
      sector: 'both',
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(baseJob, prefs);
    expect(res.matches).toBe(true);
    expect(res.matchedSpecialties).toContain('info_gen');
    expect(res.matchedGrades).toContain('all');
    expect(res.matchedLocation).toBe(true);
  });

  it('matches specific specialty: reseaux_sys and grade: tech_3', () => {
    const prefs: UserPreferences = {
      user_id: 2,
      specialties: ['reseaux_sys'],
      grades: ['tech_3'],
      locations: ['rabat'],
      sector: 'public',
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(baseJob, prefs);
    expect(res.matches).toBe(true);
    expect(res.matchedSpecialties).toContain('reseaux_sys');
    expect(res.matchedGrades).toContain('tech_3');
  });

  it('rejects when job specialty does not match user requested specialty', () => {
    const cyberJob: IngestJobPayload = {
      id: 'job-cyber-01',
      source: 'emploi-public.ma',
      title: 'Auditeur Sécurité et Pentest',
      employer: 'Agence de Développement du Digital',
      location: 'Casablanca',
      url: 'https://example.com/cyber',
      specialite: 'Cybersécurité',
      description: 'Audit technique, tests d\'intrusion et conformité sécurité des systèmes d\'information.',
    };

    const devOnlyPrefs: UserPreferences = {
      user_id: 3,
      specialties: ['dev_web'], // Only wants web development
      grades: ['all'],
      locations: ['all'],
      sector: 'both',
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(cyberJob, devOnlyPrefs);
    expect(res.matches).toBe(false);
    expect(res.reasons[0]).toContain('Aucune spécialité');
  });

  it('matches custom grade entered by user in Moroccan Arabic or French', () => {
    const dtsJob: IngestJobPayload = {
      id: 'job-dts-01',
      source: 'emploi-public.ma',
      title: 'مباراة توظيف تقنيين متخصصين تخصص تطوير الويب والتطبيقات الذكية',
      employer: 'Office National des Chemins de Fer (ONCF)',
      location: 'Casablanca',
      url: 'https://example.com/dts',
      specialite: 'تطوير المعلوميات',
      description: 'Recrutement des lauréats des ISTA titulaires du DTS en développement informatique.',
    };

    const customGradePrefs: UserPreferences = {
      user_id: 4,
      specialties: ['dev_web', 'dev_logiciel'],
      grades: ['autre'],
      custom_grade: 'DTS',
      locations: ['all'],
      sector: 'both',
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(dtsJob, customGradePrefs);
    expect(res.matches).toBe(true);
    expect(res.matchedGrades.some((g) => g.includes('custom'))).toBe(true);
  });

  it('filters based on location preferences', () => {
    const agadirJob: IngestJobPayload = {
      id: 'job-agadir-01',
      source: 'emploi-public.ma',
      title: 'Technicien Support Informatique',
      employer: 'Régie Autonome Multi-Services d\'Agadir (RAMSA)',
      location: 'Agadir',
      url: 'https://example.com/agadir',
      specialite: 'Informatique',
      description: 'Support des utilisateurs et maintenance du parc informatique.',
    };

    const tangerOnlyPrefs: UserPreferences = {
      user_id: 5,
      specialties: ['support_it'],
      grades: ['all'],
      locations: ['tanger'], // User only wants Tanger-Tetouan
      sector: 'both',
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(agadirJob, tangerOnlyPrefs);
    expect(res.matches).toBe(false);
    expect(res.matchedLocation).toBe(false);
  });

  it('filters out public sector when user requested private sector only', () => {
    const ministryJob: IngestJobPayload = {
      id: 'job-min-01',
      source: 'emploi-public.ma',
      title: 'مباراة توظيف مهندس دولة من الدرجة الأولى',
      employer: 'وزارة الاقتصاد والمالية',
      location: 'Rabat',
      url: 'https://example.com/finances',
      grade: 'Ingénieur d\'État',
      specialite: 'Informatique',
      description: 'Génie logiciel et gouvernance des données.',
    };

    const privateOnlyPrefs: UserPreferences = {
      user_id: 6,
      specialties: ['info_gen'],
      grades: ['ingenieur'],
      locations: ['all'],
      sector: 'private', // User only wants private sector
      updated_at: new Date().toISOString(),
    };

    const res = matchJobToUser(ministryJob, privateOnlyPrefs);
    expect(res.matches).toBe(false);
    expect(res.reasons.some((r) => r.includes('Secteur public exclu'))).toBe(true);
  });
});
