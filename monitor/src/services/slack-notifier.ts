/**
 * Slack notification service
 * Sends rich formatted messages to Slack when new markets are detected
 */

import { MarketData } from '../types.js';

export class SlackNotifier {
  private webhookUrl: string;
  private enabled: boolean;

  constructor(webhookUrl: string, enabled: boolean = true) {
    this.webhookUrl = webhookUrl;
    this.enabled = enabled;
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
