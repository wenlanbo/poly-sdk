/**
 * Type definitions for the Polymarket Market Monitor
 */

export interface MonitorConfig {
  // Supabase configuration
  supabase: {
    url: string;
    serviceKey: string;
  };

  // Notification configuration
  notifications: {
    slack?: {
      enabled: boolean;
      webhookUrl: string;
    };
  };

  // Monitoring configuration
  monitoring: {
    enableFiltering: boolean;
    filters?: {
      categories?: string[];
      keywords?: string[];
      minLiquidity?: number;
      minVolume?: number;
    };
  };

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Configuration for the Daily Reporter service
 */
export interface DailyReportConfig {
  // Supabase configuration
  supabase: {
    url: string;
    serviceKey: string;
  };

  // Notification configuration
  notifications: {
    slack?: {
      enabled: boolean;
      webhookUrl: string;
    };
  };

  // Schedule configuration
  schedule: {
    hourUTC: number;      // Hour in UTC (0-23)
    minuteUTC?: number;   // Minute in UTC (0-59), defaults to 0
    runImmediately?: boolean; // Run immediately on start
  };

  // Filter configuration
  filters: {
    minVolume: number;    // Minimum lifetime volume in USD
  };

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Summary of markets in a category
 */
export interface CategorySummary {
  name: string;
  markets: import('@catalyst-team/poly-sdk').GammaMarket[];
  totalVolume: number;
}

export interface MarketData {
  // Core identification
  conditionId: string;
  question: string;
  category?: string;
  slug?: string;
  endDate?: Date;

  // Financial metrics
  volume?: number;
  liquidity?: number;

  // Initial pricing
  initialYesPrice?: number;
  initialNoPrice?: number;

  // Token IDs
  yesTokenId?: string;
  noTokenId?: string;

  // Raw event data
  rawEventData?: Record<string, unknown>;

  // Timestamps
  detectedAt: Date;
}

export interface StoredMarket extends MarketData {
  id: number;
  slackNotified: boolean;
  slackNotifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketEvent {
  conditionId: string;
  type: 'created' | 'resolved';
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Kalshi-specific types
 */

/**
 * Kalshi market data for storage
 */
export interface KalshiMarketData {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle?: string;
  category?: string;
  closeTime?: Date;
  volume: number;
  volume24h: number;
  liquidity: number;
  yesPrice: number;
  noPrice: number;
  detectedAt: Date;
}

/**
 * Stored Kalshi market with database metadata
 */
export interface StoredKalshiMarket extends KalshiMarketData {
  id: number;
  slackNotified: boolean;
  slackNotifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Summary of Kalshi markets in a category
 */
export interface KalshiCategorySummary {
  name: string;
  markets: {
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
  }[];
  totalVolume: number;
}
