#!/usr/bin/env node
/**
 * Polymarket Market Monitor - Main Entry Point
 *
 * A background service that monitors Polymarket for new markets,
 * stores them in Supabase, and sends Slack notifications.
 *
 * Usage: npm start
 */

import dotenv from 'dotenv';
import { PolymarketMonitor } from './monitor.js';
import { loadConfig, displayConfig } from './config.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Display configuration
    displayConfig(config);

    // Create and start monitor
    const monitor = new PolymarketMonitor(config);
    await monitor.start();

    // Keep process running
    await new Promise(() => {}); // Run forever
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Start the monitor
main();
