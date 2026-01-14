/**
 * Kalshi Daily Reporter
 * Runs once daily at a scheduled time, fetches active markets with volume > 100K,
 * categorizes them by series/event, stores in Supabase, and sends a summary to Slack.
 *
 * Uses the official Kalshi API:
 * https://docs.kalshi.com/api-reference/market/get-markets
 */

import { DailyReportConfig, KalshiCategorySummary } from './types.js';
import { SlackNotifier } from './services/slack-notifier.js';
import { SupabaseStorage } from './services/supabase-storage.js';

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

/**
 * Market from Kalshi API
 */
interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  created_time: string;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
  status: 'initialized' | 'open' | 'paused' | 'closed' | 'settled';
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  volume: number;
  volume_24h: number;
  open_interest?: number;
  liquidity?: number;
  result?: string;
  rules_primary?: string;
  rules_secondary?: string;
  settlement_value?: number;
  notional_value?: number;
}

/**
 * Normalized Kalshi market for internal use
 */
interface NormalizedKalshiMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle?: string;
  volume: number;
  volume24h: number;
  liquidity: number;
  yesPrice: number;
  noPrice: number;
  closeTime?: Date;
  status: string;
  category: string;
}

export class KalshiDailyReporter {
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
      console.log('[KalshiReporter] Already running');
      return;
    }

    console.log('═'.repeat(60));
    console.log('Kalshi Daily Reporter Starting...');
    console.log('═'.repeat(60));

    // Test connections
    await this.testConnections();

    this.isRunning = true;

    // Calculate time until next scheduled run
    const scheduleHour = this.config.schedule.hourUTC;
    const scheduleMinute = this.config.schedule.minuteUTC || 0;

    console.log(`\n[KalshiReporter] Scheduled time: ${scheduleHour}:${scheduleMinute.toString().padStart(2, '0')} UTC`);
    console.log(`[KalshiReporter] (8:00 AM Singapore Time)`);

    // Run immediately if configured or schedule first run
    if (this.config.schedule.runImmediately) {
      console.log('\n[KalshiReporter] Running immediate report...');
      await this.runReport();
    }

    // Schedule daily runs
    this.scheduleNextRun();

    console.log('\n[KalshiReporter] Service started successfully');
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

    console.log(`[KalshiReporter] Next run scheduled for: ${nextRun.toISOString()}`);
    console.log(`[KalshiReporter] Time until next run: ${hoursUntil}h ${minutesUntil}m`);

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
    console.log(`[KalshiReporter] Running daily report at ${new Date().toISOString()}`);
    console.log('═'.repeat(60));

    try {
      // Fetch all active markets with volume > 100K
      // Note: Kalshi API doesn't support server-side volume filtering,
      // so we fetch all open markets and filter client-side
      const markets = await this.fetchHighVolumeMarkets();
      console.log(`[KalshiReporter] Found ${markets.length} markets with volume > $${(this.config.filters.minVolume / 1000).toFixed(0)}K`);

      if (markets.length === 0) {
        console.log('[KalshiReporter] No markets to report');
        return;
      }

      // Categorize markets by event ticker / series
      const categorized = this.categorizeMarkets(markets);
      console.log(`[KalshiReporter] Organized into ${Object.keys(categorized).length} categories`);

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
        await this.slackNotifier.sendKalshiDailySummary(categorized, markets.length, csvUrl);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[KalshiReporter] Report completed in ${duration}s`);
      console.log('═'.repeat(60));
    } catch (error) {
      console.error('[KalshiReporter] Error running report:', error);
    }
  }

  /**
   * Fetch all active markets with lifetime volume > minVolume
   * Kalshi API doesn't support server-side volume filtering,
   * so we fetch all open markets and filter client-side
   */
  private async fetchHighVolumeMarkets(): Promise<NormalizedKalshiMarket[]> {
    const minVolume = this.config.filters.minVolume;
    const allMarkets: KalshiMarket[] = [];
    let cursor: string | undefined;
    const limit = 1000; // Max allowed by Kalshi API

    console.log(`[KalshiReporter] Fetching active markets from Kalshi API...`);

    let pageCount = 0;
    while (true) {
      const params = new URLSearchParams({
        limit: String(limit),
        status: 'open',
      });

      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetch(`${KALSHI_API_BASE}/markets?${params}`);

      if (!response.ok) {
        throw new Error(`Kalshi API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { markets: KalshiMarket[]; cursor?: string };
      pageCount++;

      if (!data.markets || data.markets.length === 0) {
        break;
      }

      allMarkets.push(...data.markets);
      console.log(`[KalshiReporter] Fetched page ${pageCount}: ${data.markets.length} markets (total: ${allMarkets.length})`);

      // Check for next page
      if (!data.cursor) {
        break;
      }
      cursor = data.cursor;

      // Safety limit
      if (allMarkets.length > 10000) {
        console.warn('[KalshiReporter] Reached safety limit of 10000 markets');
        break;
      }
    }

    console.log(`[KalshiReporter] Total markets fetched: ${allMarkets.length}`);

    // Filter by volume client-side and normalize
    // Kalshi volume is in number of contracts, and each contract is worth $1 max
    // So volume represents the total number of contracts traded
    const highVolumeMarkets = allMarkets
      .filter(m => m.volume >= minVolume)
      .map(m => this.normalizeMarket(m))
      .sort((a, b) => b.volume - a.volume);

    console.log(`[KalshiReporter] After filtering: ${highVolumeMarkets.length} markets with volume >= ${minVolume}`);

    return highVolumeMarkets;
  }

  /**
   * Normalize a Kalshi market for internal use
   */
  private normalizeMarket(market: KalshiMarket): NormalizedKalshiMarket {
    // Calculate YES price from bid/ask or last price
    // Kalshi prices are in cents (0-100)
    let yesPrice = 0.5;
    let noPrice = 0.5;

    if (market.last_price !== undefined) {
      yesPrice = market.last_price / 100;
      noPrice = 1 - yesPrice;
    } else if (market.yes_bid !== undefined && market.yes_ask !== undefined) {
      yesPrice = ((market.yes_bid + market.yes_ask) / 2) / 100;
      noPrice = 1 - yesPrice;
    }

    // Derive category from event ticker
    const category = this.deriveCategory(market.event_ticker, market.title);

    return {
      ticker: market.ticker,
      eventTicker: market.event_ticker,
      title: market.title,
      subtitle: market.subtitle,
      volume: market.volume,
      volume24h: market.volume_24h,
      liquidity: market.liquidity || 0,
      yesPrice,
      noPrice,
      closeTime: market.close_time ? new Date(market.close_time) : undefined,
      status: market.status,
      category,
    };
  }

  /**
   * Derive category from event ticker and title
   * Kalshi uses specific ticker prefixes for different categories
   */
  private deriveCategory(eventTicker: string, title: string): string {
    const tickerLower = eventTicker.toLowerCase();
    const titleLower = title.toLowerCase();

    // Sports - Kalshi uses specific prefixes
    // NBA: KXNBA*, KXMVENBA*
    // NFL: KXNFL*, KXMVENFL*
    // MLB: KXMLB*
    // NHL: KXNHL*
    // Soccer: KXEPL*, KXMLS*
    if (tickerLower.includes('nba') || tickerLower.includes('nfl') ||
        tickerLower.includes('mlb') || tickerLower.includes('nhl') ||
        tickerLower.includes('epl') || tickerLower.includes('mls') ||
        tickerLower.includes('ncaa') || tickerLower.includes('cfb') ||
        tickerLower.includes('sport') || tickerLower.includes('super') ||
        titleLower.includes('championship') || titleLower.includes('playoffs') ||
        titleLower.includes('game') || titleLower.includes('points') ||
        titleLower.includes('rebounds') || titleLower.includes('assists') ||
        titleLower.includes('touchdown') || titleLower.includes('yards')) {
      return 'Sports';
    }

    // Politics
    if (tickerLower.includes('pres') || tickerLower.includes('elect') ||
        tickerLower.includes('trump') || tickerLower.includes('biden') ||
        tickerLower.includes('congress') || tickerLower.includes('senate') ||
        tickerLower.includes('gov') || tickerLower.includes('poll') ||
        titleLower.includes('president') || titleLower.includes('election') ||
        titleLower.includes('congress') || titleLower.includes('senate') ||
        titleLower.includes('democrat') || titleLower.includes('republican')) {
      return 'Politics';
    }

    // Economics / Fed
    if (tickerLower.includes('fed') || tickerLower.includes('fomc') ||
        tickerLower.includes('cpi') || tickerLower.includes('gdp') ||
        tickerLower.includes('rate') || tickerLower.includes('inflation') ||
        tickerLower.includes('jobs') || tickerLower.includes('unemployment') ||
        tickerLower.includes('payroll') || tickerLower.includes('recession') ||
        titleLower.includes('federal reserve') || titleLower.includes('interest rate') ||
        titleLower.includes('inflation') || titleLower.includes('economy')) {
      return 'Economy';
    }

    // Crypto
    if (tickerLower.includes('btc') || tickerLower.includes('eth') ||
        tickerLower.includes('crypto') || tickerLower.includes('bitcoin') ||
        titleLower.includes('bitcoin') || titleLower.includes('ethereum') ||
        titleLower.includes('crypto')) {
      return 'Crypto';
    }

    // Weather / Climate
    if (tickerLower.includes('temp') || tickerLower.includes('weather') ||
        tickerLower.includes('hurricane') || tickerLower.includes('climate') ||
        tickerLower.includes('highny') || tickerLower.includes('snow') ||
        titleLower.includes('temperature') || titleLower.includes('weather') ||
        titleLower.includes('degrees') || titleLower.includes('fahrenheit')) {
      return 'Weather';
    }

    // Tech
    if (tickerLower.includes('tech') || tickerLower.includes('ai') ||
        tickerLower.includes('openai') || tickerLower.includes('spacex') ||
        tickerLower.includes('tesla') || tickerLower.includes('apple') ||
        titleLower.includes('artificial intelligence') || titleLower.includes('technology')) {
      return 'Tech';
    }

    // Entertainment
    if (tickerLower.includes('oscar') || tickerLower.includes('emmy') ||
        tickerLower.includes('grammy') || tickerLower.includes('movie') ||
        tickerLower.includes('box') || tickerLower.includes('stream') ||
        titleLower.includes('award') || titleLower.includes('entertainment')) {
      return 'Entertainment';
    }

    // Finance / Markets
    if (tickerLower.includes('sp500') || tickerLower.includes('nasdaq') ||
        tickerLower.includes('stock') || tickerLower.includes('market') ||
        tickerLower.includes('spy') || tickerLower.includes('qqq') ||
        titleLower.includes('stock') || titleLower.includes('s&p')) {
      return 'Finance';
    }

    return 'Other';
  }

  /**
   * Categorize markets by derived category
   */
  private categorizeMarkets(markets: NormalizedKalshiMarket[]): Record<string, KalshiCategorySummary> {
    const categories: Record<string, KalshiCategorySummary> = {};

    for (const market of markets) {
      const category = market.category;

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
    const sortedCategories: Record<string, KalshiCategorySummary> = {};
    const sortedKeys = Object.keys(categories).sort(
      (a, b) => categories[b].totalVolume - categories[a].totalVolume
    );

    for (const key of sortedKeys) {
      sortedCategories[key] = categories[key];
    }

    return sortedCategories;
  }

  /**
   * Generate CSV content and upload to Supabase Storage
   */
  private async generateAndUploadCsv(
    markets: NormalizedKalshiMarket[],
    categories: Record<string, KalshiCategorySummary>
  ): Promise<string | null> {
    try {
      // Generate CSV content
      const csvLines: string[] = [];

      // Header
      csvLines.push('Category,Ticker,Title,Volume,Volume 24h,Liquidity,YES Price,NO Price,Close Date,URL');

      // Add each market
      for (const market of markets) {
        const url = `https://kalshi.com/markets/${market.ticker.toLowerCase()}`;

        // Escape CSV fields
        const escapeCsv = (str: string) => {
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        csvLines.push([
          escapeCsv(market.category),
          escapeCsv(market.ticker),
          escapeCsv(market.title),
          market.volume.toString(),
          market.volume24h.toString(),
          market.liquidity.toString(),
          (market.yesPrice * 100).toFixed(1) + '%',
          (market.noPrice * 100).toFixed(1) + '%',
          market.closeTime?.toISOString().split('T')[0] || '',
          url,
        ].join(','));
      }

      const csvContent = csvLines.join('\n');

      // Generate filename with date
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      const filename = `kalshi-report-${dateStr}.csv`;

      // Upload to Supabase Storage
      const csvUrl = await this.storage.uploadCsv(filename, csvContent);

      if (csvUrl) {
        console.log(`[KalshiReporter] CSV uploaded: ${csvUrl}`);
      }

      return csvUrl;
    } catch (error) {
      console.error('[KalshiReporter] Error generating CSV:', error);
      return null;
    }
  }

  /**
   * Store markets in Supabase
   */
  private async storeMarkets(markets: NormalizedKalshiMarket[]): Promise<void> {
    console.log(`[KalshiReporter] Storing ${markets.length} markets in Supabase...`);

    let stored = 0;
    let updated = 0;

    for (const market of markets) {
      try {
        // Check if already exists
        const exists = await this.storage.kalshiMarketExists(market.ticker);
        if (exists) {
          // Update existing market
          await this.storage.updateKalshiMarket(market.ticker, {
            volume: market.volume,
            volume24h: market.volume24h,
            liquidity: market.liquidity,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
          });
          updated++;
        } else {
          // Store new market
          await this.storage.storeKalshiMarket({
            ticker: market.ticker,
            eventTicker: market.eventTicker,
            title: market.title,
            subtitle: market.subtitle,
            category: market.category,
            closeTime: market.closeTime,
            volume: market.volume,
            volume24h: market.volume24h,
            liquidity: market.liquidity,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            detectedAt: new Date(),
          });
          stored++;
        }
      } catch (error) {
        console.error(`[KalshiReporter] Error storing market ${market.ticker}:`, error);
      }
    }

    console.log(`[KalshiReporter] Stored ${stored} new markets, updated ${updated} existing`);
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
    console.log('\n[KalshiReporter] Testing connections...\n');

    // Test Kalshi API
    try {
      const response = await fetch(`${KALSHI_API_BASE}/markets?limit=1`);
      if (response.ok) {
        console.log('[Kalshi API] Connection successful');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[Kalshi API] Connection failed:', error);
      throw new Error('Kalshi API connection failed');
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
        console.warn('[KalshiReporter] Slack connection failed, notifications disabled');
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

    console.log('\n[KalshiReporter] Shutting down...');
    this.isRunning = false;

    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = undefined;
    }

    console.log('[KalshiReporter] Stopped');
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
