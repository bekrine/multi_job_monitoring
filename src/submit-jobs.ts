/**
 * Standalone CLI script executed by GitHub Actions or locally
 * to scrape Moroccan IT jobs, prefilter them, and securely ingest them into Cloudflare Worker.
 */

import * as dotenv from 'dotenv';
import { ScraperCoordinator } from './scraper/scraper.ts';
import { deduplicateJobs, prefilterJob } from './matching/prefilter.ts';
import { ScrapedJob } from './matching/types.ts';
import { IngestJobPayload } from './worker/types.ts';

dotenv.config();

export interface SubmitOptions {
  workerUrl?: string;
  internalSecret?: string;
  useDemoFixtures?: boolean;
  dryRun?: boolean;
  customTargetUrl?: string;
}

export async function scrapeAndSubmitJobs(options: SubmitOptions = {}): Promise<{
  success: boolean;
  totalScraped: number;
  prefiltered: number;
  submitted: number;
  error?: string;
}> {
  const workerUrl = (options.workerUrl || process.env.CF_WORKER_URL || '').replace(/\/+$/, '');
  const internalSecret = options.internalSecret || process.env.INTERNAL_API_SECRET || '';
  const dryRun = options.dryRun ?? false;
  const useDemo = options.useDemoFixtures ?? false;

  console.log('='.repeat(65));
  console.log('Morocco IT Job Collection & Ingestion Service');
  console.log(`Target Worker: ${workerUrl || '(None - Standalone Scrape Only)'}`);
  console.log(`Source: ${useDemo ? 'Built-in Moroccan Fixtures' : 'Emploi-Public.ma Portal'}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log('='.repeat(65));

  const scraper = new ScraperCoordinator({
    useDemoFixtures: useDemo,
    customUrl: options.customTargetUrl,
  });

  // 1. Fetch raw jobs
  let rawJobs: ScrapedJob[] = [];
  try {
    rawJobs = await scraper.fetchAllJobs();
    console.log(`[Collector] Scraped ${rawJobs.length} announcements.`);
  } catch (err) {
    const msg = `Scraper failed: ${(err as Error).message}`;
    console.error(`[Collector] ${msg}`);
    return { success: false, totalScraped: 0, prefiltered: 0, submitted: 0, error: msg };
  }

  // 2. Deduplicate
  const uniqueJobs = deduplicateJobs(rawJobs);

  // 3. Enrich details & prefilter
  const eligibleJobs: IngestJobPayload[] = [];
  let prefilteredCount = 0;

  for (const job of uniqueJobs) {
    try {
      const enriched = await scraper.fetchJobDetails(job);
      job.description = enriched.description;
      job.specialite = enriched.specialite || job.specialite;
      job.deadline = enriched.deadline || job.deadline;
    } catch {
      // Continue with baseline job info
    }

    // Prefilter: must have active deadline and IT specialty
    const preRes = prefilterJob(job);
    if (!preRes.passed) {
      prefilteredCount++;
      console.log(`[Collector] Prefiltered Out: ${job.title.slice(0, 45)}... (${preRes.reason})`);
      continue;
    }

    eligibleJobs.push({
      id: job.id,
      source: 'emploi-public.ma',
      title: job.title,
      employer: job.employer,
      description: job.description,
      location: job.location,
      url: job.url,
      grade: job.title.includes('مهندس') || job.title.toLowerCase().includes('ingenieur')
        ? 'Ingénieur'
        : job.title.includes('تقني') || job.title.toLowerCase().includes('technicien')
        ? 'Technicien'
        : undefined,
      specialite: job.specialite,
      deadline: job.deadline,
      published_date: job.publishedDate,
    });
  }

  console.log(
    `[Collector] ${eligibleJobs.length} active IT opportunities passed prefiltering (${prefilteredCount} filtered out).`
  );

  // 4. Submit to Cloudflare Worker endpoint
  if (!workerUrl || !internalSecret) {
    console.warn(
      '[Collector] NOTICE: CF_WORKER_URL or INTERNAL_API_SECRET is missing. Ingestion to multi-user bot skipped.'
    );
    return {
      success: true,
      totalScraped: rawJobs.length,
      prefiltered: prefilteredCount,
      submitted: 0,
    };
  }

  const endpoint = `${workerUrl}/api/ingest-jobs`;
  console.log(`[Collector] Submitting ${eligibleJobs.length} jobs to ${endpoint}...`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        jobs: eligibleJobs,
        dryRun,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const msg = `Worker returned HTTP ${res.status}: ${errText}`;
      console.error(`[Collector] Ingestion failed: ${msg}`);
      return {
        success: false,
        totalScraped: rawJobs.length,
        prefiltered: prefilteredCount,
        submitted: 0,
        error: msg,
      };
    }

    const resJson = (await res.json()) as {
      success: boolean;
      totalReceived: number;
      newAnnouncementsStored: number;
      activeUsersMatched: number;
      digestsDelivered: number;
      errors: string[];
    };

    console.log('[Collector] Ingestion Summary:');
    console.log(`- Success: ${resJson.success ? 'YES' : 'NO'}`);
    console.log(`- Received by Worker: ${resJson.totalReceived}`);
    console.log(`- New Announcements Stored in D1: ${resJson.newAnnouncementsStored}`);
    console.log(`- Active Subscribers Matched: ${resJson.activeUsersMatched}`);
    console.log(`- Daily Digests Delivered: ${resJson.digestsDelivered}`);

    if (resJson.errors && resJson.errors.length > 0) {
      console.warn(`[Collector] Encountered warnings:`, resJson.errors);
    }

    return {
      success: resJson.success,
      totalScraped: rawJobs.length,
      prefiltered: prefilteredCount,
      submitted: eligibleJobs.length,
    };
  } catch (netErr) {
    const msg = `Network error calling Worker: ${(netErr as Error).message}`;
    console.error(`[Collector] ${msg}`);
    return {
      success: false,
      totalScraped: rawJobs.length,
      prefiltered: prefilteredCount,
      submitted: 0,
      error: msg,
    };
  }
}

// Direct CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const useDemo = args.includes('--demo');

  scrapeAndSubmitJobs({
    dryRun,
    useDemoFixtures: useDemo,
  }).then((res) => {
    process.exit(res.success ? 0 : 1);
  });
}
