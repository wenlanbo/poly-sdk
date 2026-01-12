/**
 * Polymarket Market Monitor
 * Background service that monitors for new Polymarket markets,
 * stores them in Supabase, and sends Slack notifications
 */

import { PolymarketSDK } from '@catalyst-team/poly-sdk';
import { MarketData, MonitorConfig } from './types.js';
import { SlackNotifier } from './services/slack-notifier.js';
import { SupabaseStorage } from './services/supabase-storage.js';

export class PolymarketMonitor {
  private sdk: PolymarketSDK;
  private config: MonitorConfig;
  private slackNotifier?: SlackNotifier;
  private storage: SupabaseStorage;
  private isRunning: boolean = false;
  private startTime: Date;
  private marketsDetected: number = 0;

  constructor(config: MonitorConfig) {
    this.config = config;
    this.sdk = new PolymarketSDK();
    this.startTime = new Date();

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
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Monitor] Already running');
      return;
    }

    console.log('═'.repeat(60));
    console.log('🚀 Polymarket Market Monitor Starting...');
    console.log('═'.repeat(60));

    // Test connections
    await this.testConnections();

    // Connect to Polymarket WebSocket
    console.log('\n[Monitor] Connecting to Polymarket WebSocket...');
    this.sdk.connect();

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.sdk.realtime.once('connected', () => {
        clearTimeout(timeout);
        console.log('[Monitor] ✅ Connected to Polymarket');
        resolve();
      });

      this.sdk.realtime.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Subscribe to market creation events
    console.log('[Monitor] Subscribing to market creation events...');
    this.sdk.realtime.subscribeMarketEvents({
      onMarketEvent: async (event) => {
        if (event.type === 'created') {
          await this.handleNewMarket(event);
        }
      },
    });

    this.isRunning = true;
    console.log('\n✅ Monitor is now running!');
    console.log('═'.repeat(60));
    console.log('Listening for new Polymarket markets...\n');

    // Log statistics periodically
    this.startStatsLogger();

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n[Monitor] Shutting down...');
    this.isRunning = false;
    this.sdk.realtime.disconnect();
    console.log('[Monitor] ✅ Stopped');
  }

  /**
   * Handle a new market creation event
   */
  private async handleNewMarket(event: any): Promise<void> {
    try {
      // Debug: log raw event to understand structure
      console.log('\n[DEBUG] Raw event:', JSON.stringify(event, null, 2));

      // Try multiple possible locations for condition_id
      const conditionId = event.conditionId || event.data?.condition_id || event.data?.market || '';

      console.log('\n' + '═'.repeat(60));
      console.log(`🆕 NEW MARKET DETECTED!`);
      console.log('═'.repeat(60));
      console.log(`Condition ID: ${conditionId}`);
      console.log(`Timestamp: ${new Date(event.timestamp).toLocaleString()}`);

      // Skip if no valid condition ID
      if (!conditionId) {
        console.log('⚠️  No valid condition ID found, skipping');
        return;
      }

      // Check if already in database (prevent duplicates)
      const exists = await this.storage.marketExists(conditionId);
      if (exists) {
        console.log('⚠️  Market already in database, skipping');
        return;
      }

      // Fetch full market details
      console.log('Fetching market details...');
      const market = await this.sdk.markets.getMarket(conditionId);

      // Extract market data
      // Note: category may be available from raw API but not typed in SDK
      const rawMarket = market as unknown as Record<string, unknown>;
      const marketData: MarketData = {
        conditionId,
        question: market.question,
        category: typeof rawMarket.category === 'string' ? rawMarket.category : undefined,
        slug: market.slug,
        endDate: market.endDate ? new Date(market.endDate) : undefined,
        volume: market.volume,
        liquidity: market.liquidity,
        yesTokenId: market.tokens.find((t) => t.outcome === 'Yes')?.tokenId,
        noTokenId: market.tokens.find((t) => t.outcome === 'No')?.tokenId,
        initialYesPrice: market.tokens.find((t) => t.outcome === 'Yes')?.price,
        initialNoPrice: market.tokens.find((t) => t.outcome === 'No')?.price,
        rawEventData: event.data,
        detectedAt: new Date(event.timestamp),
      };

      // Log market details
      this.logMarketDetails(marketData);

      // Apply filters if enabled
      if (this.config.monitoring.enableFiltering && !this.shouldProcessMarket(marketData)) {
        console.log('⏭️  Market filtered out, skipping');
        return;
      }

      // Store in database
      const stored = await this.storage.storeMarket(marketData);
      if (!stored) {
        console.log('⚠️  Failed to store market');
        return;
      }

      // Send Slack notification
      if (this.slackNotifier) {
        const notified = await this.slackNotifier.notifyNewMarket(marketData);
        if (notified) {
          await this.storage.markSlackNotified(conditionId);
        }
      }

      this.marketsDetected++;
      console.log('═'.repeat(60));
    } catch (error) {
      console.error('Error handling new market:', error);
    }
  }

  /**
   * Log market details to console
   */
  private logMarketDetails(market: MarketData): void {
    console.log(`\n📊 Market Details:`);
    console.log(`  Question: ${market.question}`);
    console.log(`  Category: ${market.category || 'N/A'}`);
    console.log(`  End Date: ${market.endDate?.toLocaleDateString() || 'N/A'}`);
    console.log(`  Volume: $${market.volume?.toFixed(2) || '0'}`);
    console.log(`  Liquidity: $${market.liquidity?.toFixed(2) || '0'}`);

    if (market.initialYesPrice !== undefined) {
      console.log(`  Initial YES Price: ${(market.initialYesPrice * 100).toFixed(1)}%`);
    }
    if (market.initialNoPrice !== undefined) {
      console.log(`  Initial NO Price: ${(market.initialNoPrice * 100).toFixed(1)}%`);
    }

    const marketUrl = market.slug
      ? `https://polymarket.com/event/${market.slug}`
      : `https://polymarket.com/event/${market.conditionId}`;
    console.log(`  URL: ${marketUrl}`);
  }

  /**
   * Check if a market should be processed based on filters
   */
  private shouldProcessMarket(market: MarketData): boolean {
    const filters = this.config.monitoring.filters;
    if (!filters) return true;

    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!market.category || !filters.categories.includes(market.category)) {
        return false;
      }
    }

    // Keyword filter
    if (filters.keywords && filters.keywords.length > 0) {
      const questionLower = market.question.toLowerCase();
      const hasKeyword = filters.keywords.some((keyword) =>
        questionLower.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Liquidity filter
    if (filters.minLiquidity && market.liquidity) {
      if (market.liquidity < filters.minLiquidity) {
        return false;
      }
    }

    // Volume filter
    if (filters.minVolume && market.volume) {
      if (market.volume < filters.minVolume) {
        return false;
      }
    }

    return true;
  }

  /**
   * Test all external connections
   */
  private async testConnections(): Promise<void> {
    console.log('\n🔍 Testing Connections...\n');

    // Test Supabase
    const supabaseOk = await this.storage.testConnection();
    if (!supabaseOk) {
      throw new Error('Supabase connection failed');
    }

    // Test Slack if enabled
    if (this.slackNotifier) {
      const slackOk = await this.slackNotifier.testConnection();
      if (!slackOk) {
        console.warn('⚠️  Slack connection failed, notifications will be disabled');
        this.slackNotifier = undefined;
      }
    }

    console.log('');
  }

  /**
   * Log statistics periodically
   */
  private startStatsLogger(): void {
    setInterval(() => {
      const uptime = Date.now() - this.startTime.getTime();
      const hours = Math.floor(uptime / (1000 * 60 * 60));
      const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

      console.log(
        `\n📈 Stats: ${this.marketsDetected} markets detected | Uptime: ${hours}h ${minutes}m`
      );
    }, 300000); // Every 5 minutes
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      console.log('\n\n🛑 Shutdown signal received');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
