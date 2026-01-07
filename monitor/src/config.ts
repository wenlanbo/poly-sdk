/**
 * Configuration loader
 * Loads configuration from environment variables
 */

import { MonitorConfig } from './types.js';

export function loadConfig(): MonitorConfig {
  // Validate required environment variables
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file'
    );
  }

  // Build configuration
  const config: MonitorConfig = {
    supabase: {
      url: process.env.SUPABASE_URL!,
      serviceKey: process.env.SUPABASE_SERVICE_KEY!,
    },

    notifications: {
      slack: {
        enabled: process.env.SLACK_ENABLED === 'true',
        webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      },
    },

    monitoring: {
      enableFiltering: process.env.ENABLE_FILTERING === 'true',
      filters: {
        categories: process.env.FILTER_CATEGORIES
          ? process.env.FILTER_CATEGORIES.split(',').map((c) => c.trim())
          : undefined,
        keywords: process.env.FILTER_KEYWORDS
          ? process.env.FILTER_KEYWORDS.split(',').map((k) => k.trim())
          : undefined,
        minLiquidity: process.env.FILTER_MIN_LIQUIDITY
          ? parseFloat(process.env.FILTER_MIN_LIQUIDITY)
          : undefined,
        minVolume: process.env.FILTER_MIN_VOLUME
          ? parseFloat(process.env.FILTER_MIN_VOLUME)
          : undefined,
      },
    },

    logLevel: (process.env.LOG_LEVEL as any) || 'info',
  };

  // Validate Slack configuration if enabled
  if (config.notifications.slack?.enabled && !config.notifications.slack.webhookUrl) {
    console.warn(
      '⚠️  SLACK_ENABLED is true but SLACK_WEBHOOK_URL is not set. Slack notifications will be disabled.'
    );
    config.notifications.slack.enabled = false;
  }

  return config;
}

/**
 * Display current configuration (sanitized)
 */
export function displayConfig(config: MonitorConfig): void {
  console.log('📋 Configuration:');
  console.log(`  Supabase URL: ${config.supabase.url}`);
  console.log(`  Supabase Key: ${config.supabase.serviceKey.slice(0, 20)}...`);
  console.log(`  Slack Enabled: ${config.notifications.slack?.enabled ? '✅' : '❌'}`);

  if (config.monitoring.enableFiltering) {
    console.log(`  Filtering: ✅ Enabled`);
    if (config.monitoring.filters?.categories) {
      console.log(`    Categories: ${config.monitoring.filters.categories.join(', ')}`);
    }
    if (config.monitoring.filters?.keywords) {
      console.log(`    Keywords: ${config.monitoring.filters.keywords.join(', ')}`);
    }
    if (config.monitoring.filters?.minLiquidity) {
      console.log(`    Min Liquidity: $${config.monitoring.filters.minLiquidity}`);
    }
    if (config.monitoring.filters?.minVolume) {
      console.log(`    Min Volume: $${config.monitoring.filters.minVolume}`);
    }
  } else {
    console.log(`  Filtering: ❌ Disabled (monitoring all markets)`);
  }

  console.log('');
}
