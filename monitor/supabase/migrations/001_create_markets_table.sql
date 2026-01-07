-- Create markets table to store detected Polymarket markets
-- This tracks all new markets as they are created

CREATE TABLE IF NOT EXISTS polymarket_markets (
  -- Primary identification
  id BIGSERIAL PRIMARY KEY,
  condition_id TEXT UNIQUE NOT NULL,

  -- Market details (extended data)
  question TEXT NOT NULL,
  category TEXT,
  slug TEXT,
  end_date TIMESTAMPTZ,

  -- Financial metrics
  volume DECIMAL(20, 2),
  liquidity DECIMAL(20, 2),

  -- Initial pricing data
  initial_yes_price DECIMAL(10, 6),
  initial_no_price DECIMAL(10, 6),

  -- Token information
  yes_token_id TEXT,
  no_token_id TEXT,

  -- Raw event data (for future reference)
  raw_event_data JSONB,

  -- Metadata
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Notification tracking
  slack_notified BOOLEAN DEFAULT FALSE,
  slack_notified_at TIMESTAMPTZ,

  -- Indexes for performance
  CONSTRAINT valid_condition_id CHECK (char_length(condition_id) > 0)
);

-- Indexes for efficient querying
CREATE INDEX idx_markets_condition_id ON polymarket_markets(condition_id);
CREATE INDEX idx_markets_detected_at ON polymarket_markets(detected_at DESC);
CREATE INDEX idx_markets_category ON polymarket_markets(category);
CREATE INDEX idx_markets_end_date ON polymarket_markets(end_date);
CREATE INDEX idx_markets_slack_notified ON polymarket_markets(slack_notified);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_polymarket_markets_updated_at
  BEFORE UPDATE ON polymarket_markets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE polymarket_markets IS 'Stores all detected Polymarket markets with extended data';
COMMENT ON COLUMN polymarket_markets.condition_id IS 'Unique identifier from Polymarket';
COMMENT ON COLUMN polymarket_markets.question IS 'The market question/title';
COMMENT ON COLUMN polymarket_markets.category IS 'Market category (crypto, sports, politics, etc.)';
COMMENT ON COLUMN polymarket_markets.volume IS 'Total trading volume in USD';
COMMENT ON COLUMN polymarket_markets.liquidity IS 'Available liquidity in USD';
COMMENT ON COLUMN polymarket_markets.detected_at IS 'When our system first detected this market';
COMMENT ON COLUMN polymarket_markets.slack_notified IS 'Whether Slack notification was sent';
