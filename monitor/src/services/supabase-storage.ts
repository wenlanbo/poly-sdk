/**
 * Supabase storage service
 * Handles all database operations for storing market data
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MarketData, StoredMarket } from '../types.js';

export class SupabaseStorage {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Store a new market in the database
   */
  async storeMarket(market: MarketData): Promise<StoredMarket | null> {
    try {
      const { data, error } = await this.client
        .from('polymarket_markets')
        .insert({
          condition_id: market.conditionId,
          question: market.question,
          category: market.category,
          slug: market.slug,
          end_date: market.endDate?.toISOString(),
          volume: market.volume,
          liquidity: market.liquidity,
          initial_yes_price: market.initialYesPrice,
          initial_no_price: market.initialNoPrice,
          yes_token_id: market.yesTokenId,
          no_token_id: market.noTokenId,
          raw_event_data: market.rawEventData,
          detected_at: market.detectedAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        // Check if it's a duplicate
        if (error.code === '23505') {
          console.log(`[Supabase] Market already exists: ${market.conditionId}`);
          return null;
        }
        console.error('[Supabase] Error storing market:', error);
        return null;
      }

      console.log(`[Supabase] ✅ Stored market: ${market.question.slice(0, 50)}...`);
      return this.mapToStoredMarket(data);
    } catch (error) {
      console.error('[Supabase] Unexpected error storing market:', error);
      return null;
    }
  }

  /**
   * Check if a market already exists in the database
   */
  async marketExists(conditionId: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('polymarket_markets')
        .select('condition_id')
        .eq('condition_id', conditionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        console.error('[Supabase] Error checking market existence:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('[Supabase] Unexpected error checking market:', error);
      return false;
    }
  }

  /**
   * Mark a market as notified via Slack
   */
  async markSlackNotified(conditionId: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('polymarket_markets')
        .update({
          slack_notified: true,
          slack_notified_at: new Date().toISOString(),
        })
        .eq('condition_id', conditionId);

      if (error) {
        console.error('[Supabase] Error marking Slack notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Supabase] Unexpected error marking notification:', error);
      return false;
    }
  }

  /**
   * Get recent markets
   */
  async getRecentMarkets(limit: number = 10): Promise<StoredMarket[]> {
    try {
      const { data, error } = await this.client
        .from('polymarket_markets')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[Supabase] Error fetching recent markets:', error);
        return [];
      }

      return data.map(this.mapToStoredMarket);
    } catch (error) {
      console.error('[Supabase] Unexpected error fetching markets:', error);
      return [];
    }
  }

  /**
   * Get total count of markets
   */
  async getTotalCount(): Promise<number> {
    try {
      const { count, error } = await this.client
        .from('polymarket_markets')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('[Supabase] Error getting count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('[Supabase] Unexpected error getting count:', error);
      return 0;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('polymarket_markets')
        .select('count')
        .limit(1);

      if (error) {
        console.error('[Supabase] Connection test failed:', error);
        return false;
      }

      console.log('[Supabase] ✅ Connection successful');
      return true;
    } catch (error) {
      console.error('[Supabase] Connection test error:', error);
      return false;
    }
  }

  /**
   * Map database row to StoredMarket type
   */
  private mapToStoredMarket(data: any): StoredMarket {
    return {
      id: data.id,
      conditionId: data.condition_id,
      question: data.question,
      category: data.category,
      slug: data.slug,
      endDate: data.end_date ? new Date(data.end_date) : undefined,
      volume: data.volume,
      liquidity: data.liquidity,
      initialYesPrice: data.initial_yes_price,
      initialNoPrice: data.initial_no_price,
      yesTokenId: data.yes_token_id,
      noTokenId: data.no_token_id,
      rawEventData: data.raw_event_data,
      detectedAt: new Date(data.detected_at),
      slackNotified: data.slack_notified,
      slackNotifiedAt: data.slack_notified_at ? new Date(data.slack_notified_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}
