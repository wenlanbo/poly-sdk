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
