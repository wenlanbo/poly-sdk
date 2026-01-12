/**
 * Polymarket Daily Reporter
 * Runs once daily at a scheduled time, fetches active markets with volume > 100K,
 * categorizes them, stores in Supabase, and sends a summary to Slack.
 */

import { PolymarketSDK } from '@catalyst-team/poly-sdk';
import type { GammaMarket } from '@catalyst-team/poly-sdk';
import { DailyReportConfig, CategorySummary } from './types.js';
import { SlackNotifier } from './services/slack-notifier.js';
import { SupabaseStorage } from './services/supabase-storage.js';

export class DailyReporter {
  private sdk: PolymarketSDK;
  private config: DailyReportConfig;
  private slackNotifier?: SlackNotifier;
  private storage: SupabaseStorage;
  private scheduledTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: DailyReportConfig) {
    this.config = config;
    this.sdk = new PolymarketSDK();

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
      // Fetch all active markets with volume > 100K
      const markets = await this.fetchHighVolumeMarkets();
      console.log(`[DailyReporter] Found ${markets.length} markets with volume > $100K`);

      if (markets.length === 0) {
        console.log('[DailyReporter] No markets to report');
        return;
      }

      // Categorize markets
      const categorized = this.categorizeMarkets(markets);
      console.log(`[DailyReporter] Organized into ${Object.keys(categorized).length} categories`);

      // Store in Supabase
      await this.storeMarkets(markets);

      // Send Slack summary
      if (this.slackNotifier) {
        await this.slackNotifier.sendDailySummary(categorized, markets.length);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[DailyReporter] Report completed in ${duration}s`);
      console.log('═'.repeat(60));
    } catch (error) {
      console.error('[DailyReporter] Error running report:', error);
    }
  }

  /**
   * Fetch all active markets with lifetime volume > 100K
   */
  private async fetchHighVolumeMarkets(): Promise<GammaMarket[]> {
    const minVolume = this.config.filters.minVolume;
    const allMarkets: GammaMarket[] = [];
    let offset = 0;
    const limit = 100; // API max per request
    let hasMore = true;

    console.log(`[DailyReporter] Fetching active markets with volume > $${minVolume.toLocaleString()}...`);

    while (hasMore) {
      const markets = await this.sdk.gammaApi.getMarkets({
        active: true,
        closed: false,
        order: 'volume',
        ascending: false,
        limit,
        offset,
      });

      if (markets.length === 0) {
        hasMore = false;
        break;
      }

      // Filter by minimum volume
      const filteredMarkets = markets.filter((m: GammaMarket) => m.volume >= minVolume);
      allMarkets.push(...filteredMarkets);

      // If the last market in this batch is below threshold, we're done
      if (markets[markets.length - 1].volume < minVolume) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit to prevent infinite loops
      if (offset > 10000) {
        console.warn('[DailyReporter] Reached safety limit of 10000 markets');
        hasMore = false;
      }
    }

    // Sort by volume descending
    return allMarkets.sort((a, b) => b.volume - a.volume);
  }

  /**
   * Categorize markets by keyword detection in question text
   */
  private categorizeMarkets(markets: GammaMarket[]): Record<string, CategorySummary> {
    const categories: Record<string, CategorySummary> = {};

    for (const market of markets) {
      const category = this.detectCategory(market.question);

      if (!categories[category]) {
        categories[category] = {
          name: category,
          markets: [],
          totalVolume: 0,
        };
      }

      categories[category].markets.push(market);
      categories[category].totalVolume += market.volume;
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
   * Detect category from market question using keywords
   */
  private detectCategory(question: string): string {
    const q = question.toLowerCase();

    // Politics
    if (/\b(president|election|trump|biden|democrat|republican|congress|senate|governor|mayor|primary|nomination|poll|vote|cabinet|impeach)\b/.test(q)) {
      return 'Politics';
    }

    // Geopolitics
    if (/\b(iran|israel|russia|ukraine|china|taiwan|war|strike|invasion|sanction|nato|military|nuclear|missile|ceasefire|peace)\b/.test(q)) {
      return 'Geopolitics';
    }

    // Sports - Soccer/Football
    if (/\b(fifa|world cup|premier league|la liga|champions league|soccer|football|messi|ronaldo)\b/.test(q) && !/\b(nfl|super bowl)\b/.test(q)) {
      return 'Soccer';
    }

    // Sports - American Football
    if (/\b(nfl|super bowl|touchdown|quarterback|patriots|chiefs|cowboys)\b/.test(q)) {
      return 'NFL';
    }

    // Sports - Basketball
    if (/\b(nba|basketball|lakers|celtics|warriors|lebron)\b/.test(q)) {
      return 'NBA';
    }

    // Sports - Other
    if (/\b(mlb|nhl|ufc|boxing|tennis|golf|olympics|f1|formula 1|racing)\b/.test(q)) {
      return 'Sports';
    }

    // Crypto
    if (/\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|dogecoin|doge|altcoin|defi|nft)\b/.test(q)) {
      return 'Crypto';
    }

    // Economy/Finance
    if (/\b(fed|federal reserve|interest rate|inflation|gdp|recession|stock|s&p|nasdaq|dow|treasury|unemployment|tariff)\b/.test(q)) {
      return 'Economy';
    }

    // Tech
    if (/\b(ai|artificial intelligence|openai|chatgpt|google|apple|microsoft|meta|amazon|tesla|spacex|elon musk|starship)\b/.test(q)) {
      return 'Tech';
    }

    // Entertainment
    if (/\b(oscar|grammy|emmy|movie|film|album|music|netflix|disney|celebrity|kardashian)\b/.test(q)) {
      return 'Entertainment';
    }

    // Weather
    if (/\b(temperature|weather|hurricane|storm|rainfall|snow|climate)\b/.test(q)) {
      return 'Weather';
    }

    return 'Other';
  }

  /**
   * Store markets in Supabase
   */
  private async storeMarkets(markets: GammaMarket[]): Promise<void> {
    console.log(`[DailyReporter] Storing ${markets.length} markets in Supabase...`);

    let stored = 0;
    let skipped = 0;

    for (const market of markets) {
      try {
        // Check if already exists
        const exists = await this.storage.marketExists(market.conditionId);
        if (exists) {
          // Update existing market
          await this.storage.updateMarket(market.conditionId, {
            volume: market.volume,
            liquidity: market.liquidity,
            yesPrice: market.outcomePrices[0],
            noPrice: market.outcomePrices[1],
          });
          skipped++;
        } else {
          // Store new market
          await this.storage.storeMarket({
            conditionId: market.conditionId,
            question: market.question,
            category: market.tags?.[0],
            slug: market.slug,
            endDate: market.endDate,
            volume: market.volume,
            liquidity: market.liquidity,
            initialYesPrice: market.outcomePrices[0],
            initialNoPrice: market.outcomePrices[1],
            detectedAt: new Date(),
          });
          stored++;
        }
      } catch (error) {
        console.error(`[DailyReporter] Error storing market ${market.conditionId}:`, error);
      }
    }

    console.log(`[DailyReporter] Stored ${stored} new markets, updated ${skipped} existing`);
  }

  /**
   * Test external connections
   */
  private async testConnections(): Promise<void> {
    console.log('\n[DailyReporter] Testing connections...\n');

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
