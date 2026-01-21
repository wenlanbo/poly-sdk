/**
 * Slack notification service
 * Sends rich formatted messages to Slack when new markets are detected
 */

import type { GammaMarket } from '@catalyst-team/poly-sdk';
import { MarketData, CategorySummary, KalshiCategorySummary } from '../types.js';

export class SlackNotifier {
  private webhookUrl: string;
  private enabled: boolean;

  constructor(webhookUrl: string, enabled: boolean = true) {
    this.webhookUrl = webhookUrl;
    this.enabled = enabled;
  }

  /**
   * Send a daily summary of high-volume markets to Slack
   */
  async sendDailySummary(
    categories: Record<string, CategorySummary>,
    totalMarkets: number
  ): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      console.log('[Slack] Notifications disabled, skipping daily summary');
      return false;
    }

    try {
      const payload = this.buildDailySummaryMessage(categories, totalMarkets);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Slack] Failed to send daily summary: ${response.status} - ${errorText}`);
        return false;
      }

      console.log(`[Slack] Daily summary sent (${totalMarkets} markets)`);
      return true;
    } catch (error) {
      console.error('[Slack] Error sending daily summary:', error);
      return false;
    }
  }

  /**
   * Build the daily summary Slack message
   */
  private buildDailySummaryMessage(
    categories: Record<string, CategorySummary>,
    totalMarkets: number
  ) {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Calculate total volume
    const totalVolume = Object.values(categories).reduce(
      (sum, cat) => sum + cat.totalVolume,
      0
    );

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Polymarket Daily Report',
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${date} | ${totalMarkets} markets | $${this.formatNumber(totalVolume)} total volume`,
          },
        ],
      },
      { type: 'divider' },
    ];

    // Add each category section
    for (const [categoryName, category] of Object.entries(categories)) {
      // Limit to top 5 markets per category
      const topMarkets = category.markets.slice(0, 5);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${categoryName}* (${category.markets.length} markets, $${this.formatNumber(category.totalVolume)})`,
        },
      });

      // Add market list
      const marketLines = topMarkets.map((m: GammaMarket) => {
        const yesPrice = (m.outcomePrices[0] * 100).toFixed(0);
        const volume = this.formatCompactNumber(m.volume);
        const url = `https://polymarket.com/event/${m.slug || m.conditionId}`;
        return `• <${url}|${this.truncate(m.question, 60)}> | ${yesPrice}% YES | $${volume}`;
      });

      if (category.markets.length > 5) {
        marketLines.push(`_...and ${category.markets.length - 5} more_`);
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: marketLines.join('\n'),
        },
      });
    }

    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Generated at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })} SGT`,
          },
        ],
      }
    );

    return {
      text: `Polymarket Daily Report: ${totalMarkets} markets with $100K+ volume`,
      blocks,
    };
  }

  /**
   * Truncate text to max length with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
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
   * Send a daily summary V2 - works with normalized market data
   */
  async sendDailySummaryV2(
    categories: Record<string, CategorySummary>,
    totalMarkets: number,
    csvUrl?: string | null
  ): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      console.log('[Slack] Notifications disabled, skipping daily summary');
      return false;
    }

    try {
      const payload = this.buildDailySummaryMessageV2(categories, totalMarkets, csvUrl);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Slack] Failed to send daily summary: ${response.status} - ${errorText}`);
        return false;
      }

      console.log(`[Slack] Daily summary sent (${totalMarkets} markets)`);
      return true;
    } catch (error) {
      console.error('[Slack] Error sending daily summary:', error);
      return false;
    }
  }

  /**
   * Build the daily summary Slack message V2
   */
  private buildDailySummaryMessageV2(
    categories: Record<string, CategorySummary>,
    totalMarkets: number,
    csvUrl?: string | null
  ) {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Calculate total volume
    const totalVolume = Object.values(categories).reduce(
      (sum, cat) => sum + cat.totalVolume,
      0
    );

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Polymarket Daily Report',
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${date} | ${totalMarkets} markets | $${this.formatNumber(totalVolume)} total volume`,
          },
        ],
      },
      { type: 'divider' },
    ];

    // Add each category section (limit to top 8 categories to stay under Slack's 50 block limit)
    const categoryEntries = Object.entries(categories).slice(0, 8);
    const remainingCategories = Object.keys(categories).length - 8;

    for (const [categoryName, category] of categoryEntries) {
      // Limit to top 3 markets per category
      const topMarkets = category.markets.slice(0, 3);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${categoryName}* (${category.markets.length} markets, $${this.formatCompactNumber(category.totalVolume)})`,
        },
      });

      // Add market list - handle both old GammaMarket and new normalized format
      const marketLines = topMarkets.map((m: any) => {
        // Handle both outcomePrices array and individual price fields
        let yesPrice = '50';
        if (Array.isArray(m.outcomePrices) && m.outcomePrices.length > 0) {
          yesPrice = (m.outcomePrices[0] * 100).toFixed(0);
        } else if (m.initialYesPrice !== undefined) {
          yesPrice = (m.initialYesPrice * 100).toFixed(0);
        }

        // Format 24h price change if available
        let priceChangeStr = '';
        if (m.oneDayPriceChange !== undefined && m.oneDayPriceChange !== null) {
          const change = m.oneDayPriceChange * 100;
          const sign = change >= 0 ? '+' : '';
          priceChangeStr = ` (${sign}${change.toFixed(1)}%)`;
        }

        // Handle both volumeNum and volume fields
        const volume = this.formatCompactNumber(m.volume || m.volumeNum || 0);
        const url = `https://polymarket.com/event/${m.slug || m.conditionId}`;
        return `• <${url}|${this.truncate(m.question, 50)}> | ${yesPrice}%${priceChangeStr} | $${volume}`;
      });

      if (category.markets.length > 3) {
        marketLines.push(`_...and ${category.markets.length - 3} more_`);
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: marketLines.join('\n'),
        },
      });
    }

    // Add note about remaining categories if any
    if (remainingCategories > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_+ ${remainingCategories} more categories not shown_`,
          },
        ],
      });
    }

    // Add CSV download button if available
    if (csvUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Download Full CSV Report',
              emoji: true,
            },
            url: csvUrl,
            style: 'primary',
          },
        ],
      });
    }

    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Generated at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })} SGT`,
          },
        ],
      }
    );

    return {
      text: `Polymarket Daily Report: ${totalMarkets} markets with $100K+ volume`,
      blocks,
    };
  }

  /**
   * Send a notification about a new market to Slack
   */
  async notifyNewMarket(market: MarketData): Promise<boolean> {
    if (!this.enabled) {
      console.log('[Slack] Notifications disabled, skipping');
      return false;
    }

    if (!this.webhookUrl) {
      console.error('[Slack] No webhook URL configured');
      return false;
    }

    try {
      const payload = this.buildSlackMessage(market);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Slack] Failed to send notification: ${response.status} - ${errorText}`);
        return false;
      }

      console.log(`[Slack] ✅ Notification sent for: ${market.question.slice(0, 50)}...`);
      return true;
    } catch (error) {
      console.error('[Slack] Error sending notification:', error);
      return false;
    }
  }

  /**
   * Build a rich Slack message with formatting
   */
  private buildSlackMessage(market: MarketData) {
    // Format prices as percentages
    const yesPrice = market.initialYesPrice
      ? `${(market.initialYesPrice * 100).toFixed(1)}%`
      : 'N/A';
    const noPrice = market.initialNoPrice
      ? `${(market.initialNoPrice * 100).toFixed(1)}%`
      : 'N/A';

    // Format volume and liquidity
    const volume = market.volume ? `$${this.formatNumber(market.volume)}` : 'N/A';
    const liquidity = market.liquidity ? `$${this.formatNumber(market.liquidity)}` : 'N/A';

    // Format end date
    const endDate = market.endDate
      ? new Date(market.endDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'N/A';

    // Build market URL
    const marketUrl = market.slug
      ? `https://polymarket.com/event/${market.slug}`
      : `https://polymarket.com/event/${market.conditionId}`;

    // Create Slack Block Kit message
    return {
      text: `🆕 New Polymarket Market: ${market.question}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🆕 New Polymarket Market Detected',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${market.question}*`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Category:*\n${market.category || 'Uncategorized'}`,
            },
            {
              type: 'mrkdwn',
              text: `*End Date:*\n${endDate}`,
            },
            {
              type: 'mrkdwn',
              text: `*Initial YES Price:*\n${yesPrice}`,
            },
            {
              type: 'mrkdwn',
              text: `*Initial NO Price:*\n${noPrice}`,
            },
            {
              type: 'mrkdwn',
              text: `*Volume:*\n${volume}`,
            },
            {
              type: 'mrkdwn',
              text: `*Liquidity:*\n${liquidity}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Condition ID:* \`${market.conditionId}\``,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📊 View Market',
                emoji: true,
              },
              url: marketUrl,
              style: 'primary',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Detected at ${new Date(market.detectedAt).toLocaleString('en-US')}`,
            },
          ],
        },
        {
          type: 'divider',
        },
      ],
    };
  }

  /**
   * Format numbers with commas
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Send a Kalshi daily summary to Slack
   */
  async sendKalshiDailySummary(
    categories: Record<string, KalshiCategorySummary>,
    totalMarkets: number,
    csvUrl?: string | null
  ): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      console.log('[Slack] Notifications disabled, skipping Kalshi daily summary');
      return false;
    }

    try {
      const payload = this.buildKalshiDailySummaryMessage(categories, totalMarkets, csvUrl);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Slack] Failed to send Kalshi daily summary: ${response.status} - ${errorText}`);
        return false;
      }

      console.log(`[Slack] Kalshi daily summary sent (${totalMarkets} markets)`);
      return true;
    } catch (error) {
      console.error('[Slack] Error sending Kalshi daily summary:', error);
      return false;
    }
  }

  /**
   * Build the Kalshi daily summary Slack message
   */
  private buildKalshiDailySummaryMessage(
    categories: Record<string, KalshiCategorySummary>,
    totalMarkets: number,
    csvUrl?: string | null
  ) {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Calculate total volume
    const totalVolume = Object.values(categories).reduce(
      (sum, cat) => sum + cat.totalVolume,
      0
    );

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Kalshi Daily Report',
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${date} | ${totalMarkets} markets | ${this.formatCompactNumber(totalVolume)} contracts volume`,
          },
        ],
      },
      { type: 'divider' },
    ];

    // Add each category section (limit to top 8 categories to stay under Slack's 50 block limit)
    const categoryEntries = Object.entries(categories).slice(0, 8);
    const remainingCategories = Object.keys(categories).length - 8;

    for (const [categoryName, category] of categoryEntries) {
      // Limit to top 3 markets per category
      const topMarkets = category.markets.slice(0, 3);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${categoryName}* (${category.markets.length} markets, ${this.formatCompactNumber(category.totalVolume)} contracts)`,
        },
      });

      // Add market list
      const marketLines = topMarkets.map((m) => {
        const yesPrice = (m.yesPrice * 100).toFixed(0);
        const volume = this.formatCompactNumber(m.volume);
        const url = `https://kalshi.com/markets/${m.ticker.toLowerCase()}`;
        return `• <${url}|${this.truncate(m.title, 55)}> | ${yesPrice}% YES | ${volume} vol`;
      });

      if (category.markets.length > 3) {
        marketLines.push(`_...and ${category.markets.length - 3} more_`);
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: marketLines.join('\n'),
        },
      });
    }

    // Add note about remaining categories if any
    if (remainingCategories > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_+ ${remainingCategories} more categories not shown_`,
          },
        ],
      });
    }

    // Add CSV download button if available
    if (csvUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Download Full CSV Report',
              emoji: true,
            },
            url: csvUrl,
            style: 'primary',
          },
        ],
      });
    }

    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Generated at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })} SGT`,
          },
        ],
      }
    );

    return {
      text: `Kalshi Daily Report: ${totalMarkets} markets with $100K+ volume`,
      blocks,
    };
  }

  /**
   * Test the Slack webhook connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.webhookUrl) {
      console.error('[Slack] No webhook URL configured');
      return false;
    }

    try {
      const payload = {
        text: '✅ Polymarket Market Monitor - Slack connection test successful!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ *Polymarket Market Monitor*\n\nSlack notifications are working correctly!',
            },
          },
        ],
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Slack] Test failed: ${response.status}`);
        return false;
      }

      console.log('[Slack] ✅ Test message sent successfully');
      return true;
    } catch (error) {
      console.error('[Slack] Test error:', error);
      return false;
    }
  }
}
