#!/usr/bin/env node
/**
 * Polymarket Daily Reporter - Main Entry Point
 *
 * A background service that runs daily at a scheduled time,
 * fetches high-volume markets from Polymarket, categorizes them,
 * stores them in Supabase, and sends a summary to Slack.
 *
 * Usage: npm start
 *
 * Environment Variables:
 *   SUPABASE_URL          - Supabase project URL
 *   SUPABASE_SERVICE_KEY  - Supabase service role key
 *   SLACK_ENABLED         - Enable Slack notifications (true/false)
 *   SLACK_WEBHOOK_URL     - Slack webhook URL
 *   SCHEDULE_HOUR_UTC     - Hour to run (UTC, 0-23, default: 0 = 8 AM SGT)
 *   SCHEDULE_MINUTE_UTC   - Minute to run (UTC, 0-59, default: 0)
 *   RUN_IMMEDIATELY       - Run immediately on start (true/false)
 *   MIN_VOLUME            - Minimum volume filter in USD (default: 100000)
 */

import dotenv from 'dotenv';
import { DailyReporter } from './daily-reporter.js';
import { loadDailyReportConfig, displayDailyReportConfig } from './config.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Load configuration
    const config = loadDailyReportConfig();

    // Display configuration
    displayDailyReportConfig(config);

    // Create and start the daily reporter
    const reporter = new DailyReporter(config);
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
