-- Create kalshi_markets table for storing Kalshi market data
-- This table mirrors the polymarket_markets table structure but with Kalshi-specific fields

CREATE TABLE IF NOT EXISTS kalshi_markets (
  id BIGSERIAL PRIMARY KEY,

  -- Core identification (Kalshi uses ticker instead of condition_id)
  ticker TEXT UNIQUE NOT NULL,
  event_ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,

  -- Categorization
  category TEXT,

  -- Timing
  close_time TIMESTAMPTZ,

  -- Volume and liquidity (Kalshi volume is in number of contracts)
  volume DECIMAL(20, 2),
  volume_24h DECIMAL(20, 2),
  liquidity DECIMAL(20, 2),

  -- Pricing (stored as decimals 0-1)
  yes_price DECIMAL(10, 6),
  no_price DECIMAL(10, 6),

  -- Detection metadata
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Notification tracking
  slack_notified BOOLEAN DEFAULT FALSE,
  slack_notified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_ticker ON kalshi_markets(ticker);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_event_ticker ON kalshi_markets(event_ticker);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_detected_at ON kalshi_markets(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_category ON kalshi_markets(category);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_close_time ON kalshi_markets(close_time);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_volume ON kalshi_markets(volume DESC);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_slack_notified ON kalshi_markets(slack_notified);

-- Create trigger to update updated_at on row update
CREATE OR REPLACE FUNCTION update_kalshi_markets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_kalshi_markets_updated_at ON kalshi_markets;
CREATE TRIGGER trigger_kalshi_markets_updated_at
  BEFORE UPDATE ON kalshi_markets
  FOR EACH ROW
  EXECUTE FUNCTION update_kalshi_markets_updated_at();

-- Add comment to table
COMMENT ON TABLE kalshi_markets IS 'Stores Kalshi prediction market data for daily reporting';
COMMENT ON COLUMN kalshi_markets.ticker IS 'Unique Kalshi market ticker (e.g., KXBTC-25JAN15-T59999.99)';
COMMENT ON COLUMN kalshi_markets.event_ticker IS 'Parent event ticker (e.g., KXBTC)';
COMMENT ON COLUMN kalshi_markets.volume IS 'Total number of contracts traded (lifetime)';
COMMENT ON COLUMN kalshi_markets.volume_24h IS 'Number of contracts traded in last 24 hours';
