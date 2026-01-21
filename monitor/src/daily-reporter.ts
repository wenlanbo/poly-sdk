/**
 * Polymarket Daily Reporter
 * Runs once daily at a scheduled time, fetches active markets with volume > 100K,
 * categorizes them by official Polymarket tags, stores in Supabase, and sends a summary to Slack.
 *
 * Uses the official Polymarket Gamma API:
 * https://docs.polymarket.com/api-reference/markets/list-markets
 */

import { DailyReportConfig, CategorySummary } from './types.js';
import { SlackNotifier } from './services/slack-notifier.js';
import { SupabaseStorage } from './services/supabase-storage.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

/**
 * Tag from Polymarket API
 */
interface PolymarketTag {
  id: string;
  label: string;
  slug: string;
  forceShow?: boolean;
  forceHide?: boolean;
}

/**
 * Market from Polymarket API with full tag support
 */
interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volumeNum: number;
  volume24hr?: number;
  liquidityNum: number;
  outcomePrices: string; // JSON string like "[0.65, 0.35]"
  outcomes: string; // JSON string like '["Yes", "No"]'
  tags?: PolymarketTag[];
  // Price fields
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
}

export class DailyReporter {
  private config: DailyReportConfig;
  private slackNotifier?: SlackNotifier;
  private storage: SupabaseStorage;
  private scheduledTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: DailyReportConfig) {
    this.config = config;

    // Initialize storage
    this.storage = new SupabaseStorage(
      config.supabase.url,
      config.supabase.serviceKey
    );

    // Initialize Slack notifier if configured
    if (config.notifications.slack?.enabled && config.notifications.slack.webhookUrl) {
      this.slackNotifier = new SlackNotifier(
        config.notifications.slack.webhookUrl,
        true
      );
    }
  }

  /**
   * Start the daily reporter service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[DailyReporter] Already running');
      return;
    }

    console.log('═'.repeat(60));
    console.log('Polymarket Daily Reporter Starting...');
    console.log('═'.repeat(60));

    // Test connections
    await this.testConnections();

    this.isRunning = true;

    // Calculate time until next scheduled run
    const scheduleHour = this.config.schedule.hourUTC;
    const scheduleMinute = this.config.schedule.minuteUTC || 0;

    console.log(`\n[DailyReporter] Scheduled time: ${scheduleHour}:${scheduleMinute.toString().padStart(2, '0')} UTC`);
    console.log(`[DailyReporter] (8:00 AM Singapore Time)`);

    // Run immediately if configured or schedule first run
    if (this.config.schedule.runImmediately) {
      console.log('\n[DailyReporter] Running immediate report...');
      await this.runReport();
    }

    // Schedule daily runs
    this.scheduleNextRun();

    console.log('\n[DailyReporter] Service started successfully');
    console.log('═'.repeat(60));

    // Setup graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Schedule the next daily run
   */
  private scheduleNextRun(): void {
    const now = new Date();
    const scheduleHour = this.config.schedule.hourUTC;
    const scheduleMinute = this.config.schedule.minuteUTC || 0;

    // Calculate next run time
    const nextRun = new Date(now);
    nextRun.setUTCHours(scheduleHour, scheduleMinute, 0, 0);

    // If we've already passed today's scheduled time, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const msUntilNextRun = nextRun.getTime() - now.getTime();
    const hoursUntil = Math.floor(msUntilNextRun / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntilNextRun % (1000 * 60 * 60)) / (1000 * 60));

    console.log(`[DailyReporter] Next run scheduled for: ${nextRun.toISOString()}`);
    console.log(`[DailyReporter] Time until next run: ${hoursUntil}h ${minutesUntil}m`);

    this.scheduledTimer = setTimeout(async () => {
      if (this.isRunning) {
        await this.runReport();
        this.scheduleNextRun(); // Schedule the next run
      }
    }, msUntilNextRun);
  }

  /**
   * Run the daily report
   */
  async runReport(): Promise<void> {
    const startTime = Date.now();
    console.log('\n' + '═'.repeat(60));
    console.log(`[DailyReporter] Running daily report at ${new Date().toISOString()}`);
    console.log('═'.repeat(60));

    try {
      // Fetch all active markets with volume > 100K using official API
      const markets = await this.fetchHighVolumeMarkets();
      console.log(`[DailyReporter] Found ${markets.length} markets with volume > $${(this.config.filters.minVolume / 1000).toFixed(0)}K`);

      if (markets.length === 0) {
        console.log('[DailyReporter] No markets to report');
        return;
      }

      // Categorize markets using official Polymarket tags
      const categorized = this.categorizeMarkets(markets);
      console.log(`[DailyReporter] Organized into ${Object.keys(categorized).length} categories`);

      // Log categories found
      for (const [name, cat] of Object.entries(categorized)) {
        console.log(`  - ${name}: ${cat.markets.length} markets, $${this.formatCompactNumber(cat.totalVolume)}`);
      }

      // Store in Supabase
      await this.storeMarkets(markets);

      // Generate and upload CSV
      const csvUrl = await this.generateAndUploadCsv(markets, categorized);

      // Send Slack summary with CSV link
      if (this.slackNotifier) {
        await this.slackNotifier.sendDailySummaryV2(categorized, markets.length, csvUrl);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[DailyReporter] Report completed in ${duration}s`);
      console.log('═'.repeat(60));
    } catch (error) {
      console.error('[DailyReporter] Error running report:', error);
    }
  }

  /**
   * Fetch all active markets with lifetime volume > minVolume
   * Uses the official Polymarket Gamma API with server-side filtering
   */
  private async fetchHighVolumeMarkets(): Promise<PolymarketMarket[]> {
    const minVolume = this.config.filters.minVolume;
    const allMarkets: PolymarketMarket[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    console.log(`[DailyReporter] Fetching active markets with volume > $${minVolume.toLocaleString()}...`);

    while (hasMore) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        volume_num_min: String(minVolume),
        closed: 'false',
        include_tag: 'true',
        order: 'volumeNum',
        ascending: 'false',
      });

      const response = await fetch(`${GAMMA_API_BASE}/markets?${params}`);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const markets = await response.json() as PolymarketMarket[];

      if (markets.length === 0) {
        hasMore = false;
        break;
      }

      allMarkets.push(...markets);
      offset += limit;

      // If we got fewer than limit, we've reached the end
      if (markets.length < limit) {
        hasMore = false;
      }

      // Safety limit
      if (offset > 5000) {
        console.warn('[DailyReporter] Reached safety limit of 5000 markets');
        hasMore = false;
      }
    }

    // Sort by volume descending
    return allMarkets.sort((a, b) => b.volumeNum - a.volumeNum);
  }

  /**
   * Categorize markets using official Polymarket tags
   * Priority: Sports > Politics > Crypto > Pop Culture > Science & Tech > Business
   */
  private categorizeMarkets(markets: PolymarketMarket[]): Record<string, CategorySummary> {
    const categories: Record<string, CategorySummary> = {};

    // Priority tags to look for (in order of preference for primary category)
    const priorityTags = ['Sports', 'Politics', 'Crypto', 'Pop Culture', 'Science & Tech', 'Business', 'Economy', 'Finance'];

    for (const market of markets) {
      let category = 'Other';

      if (market.tags && market.tags.length > 0) {
        // Find the first priority tag that matches
        for (const priorityTag of priorityTags) {
          const found = market.tags.find(t =>
            t.label?.toLowerCase() === priorityTag.toLowerCase() ||
            t.slug?.toLowerCase() === priorityTag.toLowerCase().replace(/\s+/g, '-')
          );
          if (found) {
            category = found.label || priorityTag;
            break;
          }
        }

        // If no priority tag found, use the first visible tag
        if (category === 'Other') {
          const visibleTag = market.tags.find(t => !t.forceHide && t.label);
          if (visibleTag && visibleTag.label) {
            category = visibleTag.label;
          }
        }
      }

      // Normalize category name
      category = this.normalizeCategory(category);

      if (!categories[category]) {
        categories[category] = {
          name: category,
          markets: [],
          totalVolume: 0,
        };
      }

      // Convert to the format expected by CategorySummary
      const normalizedMarket = this.normalizeMarket(market);
      categories[category].markets.push(normalizedMarket as any);
      categories[category].totalVolume += market.volumeNum;
    }

    // Sort categories by total volume
    const sortedCategories: Record<string, CategorySummary> = {};
    const sortedKeys = Object.keys(categories).sort(
      (a, b) => categories[b].totalVolume - categories[a].totalVolume
    );

    for (const key of sortedKeys) {
      sortedCategories[key] = categories[key];
    }

    return sortedCategories;
  }

  /**
   * Normalize category names for consistency
   */
  private normalizeCategory(category: string): string {
    const normalizations: Record<string, string> = {
      'fed': 'Economy',
      'fed rates': 'Economy',
      'finance': 'Economy',
      'economic policy': 'Economy',
      'soccer': 'Sports',
      'nba': 'Sports',
      'nfl': 'Sports',
      'mlb': 'Sports',
      'nhl': 'Sports',
      'epl': 'Sports',
      'tennis': 'Sports',
      'mma': 'Sports',
      'pop culture': 'Entertainment',
      'science & tech': 'Tech',
      'ai': 'Tech',
    };

    const lower = category.toLowerCase();
    return normalizations[lower] || category;
  }

  /**
   * Normalize market data for storage and display
   */
  private normalizeMarket(market: PolymarketMarket) {
    let outcomePrices: number[] = [0.5, 0.5];
    try {
      const parsed = JSON.parse(market.outcomePrices);
      if (Array.isArray(parsed)) {
        outcomePrices = parsed.map(Number);
      }
    } catch {
      // Use default
    }

    return {
      id: market.id,
      conditionId: market.conditionId,
      slug: market.slug,
      question: market.question,
      volume: market.volumeNum,
      volume24hr: market.volume24hr,
      liquidity: market.liquidityNum,
      outcomePrices,
      endDate: market.endDate ? new Date(market.endDate) : undefined,
      active: market.active,
      closed: market.closed,
      tags: market.tags,
    };
  }

  /**
   * Generate CSV content and upload to Supabase Storage
   */
  private async generateAndUploadCsv(
    markets: PolymarketMarket[],
    categories: Record<string, CategorySummary>
  ): Promise<string | null> {
    try {
      // Generate CSV content
      const csvLines: string[] = [];

      // Header
      csvLines.push('Category,Question,Volume,Volume 24h,Liquidity,YES Price,NO Price,End Date,URL');

      // Create a map of market to category
      const marketCategoryMap = new Map<string, string>();
      for (const [categoryName, category] of Object.entries(categories)) {
        for (const market of category.markets) {
          marketCategoryMap.set((market as any).conditionId, categoryName);
        }
      }

      // Add each market
      for (const market of markets) {
        const normalized = this.normalizeMarket(market);
        const category = marketCategoryMap.get(market.conditionId) || 'Other';
        const url = `https://polymarket.com/event/${market.slug || market.conditionId}`;

        // Escape CSV fields
        const escapeCsv = (str: string) => {
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        csvLines.push([
          escapeCsv(category),
          escapeCsv(market.question),
          market.volumeNum.toFixed(2),
          (market.volume24hr || 0).toFixed(2),
          market.liquidityNum.toFixed(2),
          (normalized.outcomePrices[0] * 100).toFixed(1) + '%',
          (normalized.outcomePrices[1] * 100).toFixed(1) + '%',
          market.endDate || '',
          url,
        ].join(','));
      }

      const csvContent = csvLines.join('\n');

      // Generate filename with date
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      const filename = `polymarket-report-${dateStr}.csv`;

      // Upload to Supabase Storage
      const csvUrl = await this.storage.uploadCsv(filename, csvContent);

      if (csvUrl) {
        console.log(`[DailyReporter] CSV uploaded: ${csvUrl}`);
      }

      return csvUrl;
    } catch (error) {
      console.error('[DailyReporter] Error generating CSV:', error);
      return null;
    }
  }

  /**
   * Store markets in Supabase
   */
  private async storeMarkets(markets: PolymarketMarket[]): Promise<void> {
    console.log(`[DailyReporter] Storing ${markets.length} markets in Supabase...`);

    let stored = 0;
    let updated = 0;

    for (const market of markets) {
      try {
        const normalized = this.normalizeMarket(market);
        const primaryTag = market.tags?.find(t => !t.forceHide)?.label;

        // Check if already exists
        const exists = await this.storage.marketExists(market.conditionId);
        if (exists) {
          // Update existing market
          await this.storage.updateMarket(market.conditionId, {
            volume: market.volumeNum,
            liquidity: market.liquidityNum,
            yesPrice: normalized.outcomePrices[0],
            noPrice: normalized.outcomePrices[1],
          });
          updated++;
        } else {
          // Store new market
          await this.storage.storeMarket({
            conditionId: market.conditionId,
            question: market.question,
            category: primaryTag,
            slug: market.slug,
            endDate: market.endDate ? new Date(market.endDate) : undefined,
            volume: market.volumeNum,
            liquidity: market.liquidityNum,
            initialYesPrice: normalized.outcomePrices[0],
            initialNoPrice: normalized.outcomePrices[1],
            detectedAt: new Date(),
          });
          stored++;
        }
      } catch (error) {
        console.error(`[DailyReporter] Error storing market ${market.conditionId}:`, error);
      }
    }

    console.log(`[DailyReporter] Stored ${stored} new markets, updated ${updated} existing`);
  }

  /**
   * Format number in compact form (e.g., 1.5M, 250K)
   */
  private formatCompactNumber(num: number): string {
    if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(1) + 'M';
    }
    if (num >= 1_000) {
      return (num / 1_000).toFixed(0) + 'K';
    }
    return num.toFixed(0);
  }

  /**
   * Test external connections
   */
  private async testConnections(): Promise<void> {
    console.log('\n[DailyReporter] Testing connections...\n');

    // Test Polymarket API
    try {
      const response = await fetch(`${GAMMA_API_BASE}/markets?limit=1`);
      if (response.ok) {
        console.log('[Polymarket API] Connection successful');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[Polymarket API] Connection failed:', error);
      throw new Error('Polymarket API connection failed');
    }

    // Test Supabase
    const supabaseOk = await this.storage.testConnection();
    if (!supabaseOk) {
      throw new Error('Supabase connection failed');
    }

    // Test Slack if enabled
    if (this.slackNotifier) {
      const slackOk = await this.slackNotifier.testConnection();
      if (!slackOk) {
        console.warn('[DailyReporter] Slack connection failed, notifications disabled');
        this.slackNotifier = undefined;
      }
    }

    console.log('');
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n[DailyReporter] Shutting down...');
    this.isRunning = false;

    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = undefined;
    }

    console.log('[DailyReporter] Stopped');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      console.log('\n\nShutdown signal received');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
