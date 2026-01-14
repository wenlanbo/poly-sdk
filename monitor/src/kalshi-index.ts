#!/usr/bin/env node
/**
 * Kalshi Daily Reporter - Main Entry Point
 *
 * A background service that runs daily at a scheduled time,
 * fetches high-volume markets from Kalshi, categorizes them,
 * stores them in Supabase, and sends a summary to Slack.
 *
 * Usage: npm run start:kalshi
 *
 * Environment Variables:
 *   SUPABASE_URL          - Supabase project URL
 *   SUPABASE_SERVICE_KEY  - Supabase service role key
 *   SLACK_ENABLED         - Enable Slack notifications (true/false)
 *   SLACK_WEBHOOK_URL     - Slack webhook URL
 *   SCHEDULE_HOUR_UTC     - Hour to run (UTC, 0-23, default: 0 = 8 AM SGT)
 *   SCHEDULE_MINUTE_UTC   - Minute to run (UTC, 0-59, default: 0)
 *   RUN_IMMEDIATELY       - Run immediately on start (true/false)
 *   MIN_VOLUME            - Minimum volume filter (default: 100000 contracts)
 */

import dotenv from 'dotenv';
import { KalshiDailyReporter } from './kalshi-daily-reporter.js';
import { loadDailyReportConfig, displayDailyReportConfig } from './config.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║             KALSHI DAILY REPORTER                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Load configuration (same format as Polymarket)
    const config = loadDailyReportConfig();

    // Override min volume for Kalshi if not explicitly set
    // Kalshi volume is in contracts (~$1 each), not USD like Polymarket
    // Default to 1000 contracts for Kalshi (vs 100K USD for Polymarket)
    const kalshiMinVolume = parseInt(process.env.KALSHI_MIN_VOLUME || '1000', 10);
    config.filters.minVolume = kalshiMinVolume;

    // Display configuration
    console.log('Configuration:');
    console.log(`  Supabase URL: ${config.supabase.url}`);
    console.log(`  Supabase Key: ${config.supabase.serviceKey.slice(0, 20)}...`);
    console.log(`  Slack Enabled: ${config.notifications.slack?.enabled ? 'Yes' : 'No'}`);
    console.log(`  Schedule: ${config.schedule.hourUTC}:${(config.schedule.minuteUTC || 0).toString().padStart(2, '0')} UTC`);
    console.log(`  Run Immediately: ${config.schedule.runImmediately ? 'Yes' : 'No'}`);
    console.log(`  Min Volume Filter: ${config.filters.minVolume.toLocaleString()} contracts (~$${config.filters.minVolume.toLocaleString()})`);
    console.log('');

    // Create and start the Kalshi daily reporter
    const reporter = new KalshiDailyReporter(config);
    await reporter.start();

    // Keep process running
    await new Promise(() => {}); // Run forever
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Start the reporter
main();
