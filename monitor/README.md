# Prediction Market Monitor

A production-ready background service that monitors **Polymarket** and **Kalshi** prediction markets, generates daily reports of high-volume markets, stores data in Supabase, and sends beautiful Slack notifications.

## Features

- **Daily Reports** - Scheduled daily reports of markets with >$100K volume
- **Multi-Platform** - Supports both Polymarket and Kalshi
- **Supabase Storage** - Market data stored in PostgreSQL with full history
- **Slack Notifications** - Beautiful formatted daily summaries with CSV download
- **Smart Categorization** - Automatic market categorization by topic
- **CSV Export** - Downloadable reports uploaded to Supabase Storage
- **Docker Ready** - Easy deployment with Docker Compose
- **Production Tested** - Built with TypeScript, error handling, and best practices

## 📋 Prerequisites

Before you begin, you'll need:

1. **Node.js 20+** (if running without Docker)
2. **Supabase account** (free tier works fine)
3. **Slack workspace** with webhook access

## 🚀 Quick Start

### Step 1: Clone and Install

```bash
# Navigate to the monitor directory
cd monitor

# Install dependencies
npm install
```

### Step 2: Set Up Supabase

Follow the detailed guide in [`supabase/README.md`](./supabase/README.md):

1. Create a Supabase project at https://supabase.com
2. Run the database migration (copy/paste SQL from `supabase/migrations/001_create_markets_table.sql`)
3. Get your Supabase URL and Service Role Key

### Step 3: Set Up Slack Webhook

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name it "Polymarket Monitor" and select your workspace
4. Go to **"Incoming Webhooks"** in the sidebar
5. Toggle **"Activate Incoming Webhooks"** to ON
6. Click **"Add New Webhook to Workspace"**
7. Select the channel where you want notifications (e.g., `#polymarket`)
8. Copy the **Webhook URL** (looks like `https://hooks.slack.com/services/...`)

### Step 4: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and fill in your values
nano .env  # or use your preferred editor
```

**Required settings in `.env`:**
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...your-service-role-key
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Step 5: Run the Database Migrations

Run both Polymarket and Kalshi migrations in Supabase:

```bash
# Copy the SQL from these files and run in Supabase SQL Editor:
# - supabase/migrations/001_create_markets_table.sql (Polymarket)
# - supabase/migrations/002_create_kalshi_markets_table.sql (Kalshi)
```

### Step 6: Run the Monitor

**Option A: Using Docker (Recommended)**

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the monitor
docker-compose down
```

**Option B: Direct Node.js**

```bash
# Build first
npm run build

# Run Polymarket reporter
npm start                  # or: npm run start:polymarket

# Run Kalshi reporter
npm run start:kalshi

# Development mode (with auto-reload)
npm run dev                # Polymarket
npm run dev:kalshi         # Kalshi
```

## 📊 What You'll See

### Console Output

```
═══════════════════════════════════════════════════════════
🚀 Polymarket Market Monitor Starting...
═══════════════════════════════════════════════════════════

🔍 Testing Connections...

[Supabase] ✅ Connection successful
[Slack] ✅ Test message sent successfully

📋 Configuration:
  Supabase URL: https://xxxxx.supabase.co
  Supabase Key: eyJhbGciOiJIUzI1NiI...
  Slack Enabled: ✅
  Filtering: ❌ Disabled (monitoring all markets)

[Monitor] Connecting to Polymarket WebSocket...
[Monitor] ✅ Connected to Polymarket
[Monitor] Subscribing to market creation events...

✅ Monitor is now running!
═══════════════════════════════════════════════════════════
Listening for new Polymarket markets...

═══════════════════════════════════════════════════════════
🆕 NEW MARKET DETECTED!
═══════════════════════════════════════════════════════════
Condition ID: 0x1234...
Timestamp: 1/7/2026, 3:45:30 PM

📊 Market Details:
  Question: Will Bitcoin reach $100,000 by February 2026?
  Category: crypto
  End Date: 2/28/2026
  Volume: $1250.00
  Liquidity: $5000.00
  Initial YES Price: 45.5%
  Initial NO Price: 54.5%
  URL: https://polymarket.com/event/bitcoin-100k-feb-2026

[Supabase] ✅ Stored market: Will Bitcoin reach $100,000 by February 2026?
[Slack] ✅ Notification sent for: Will Bitcoin reach $100,000 by February 2026?
═══════════════════════════════════════════════════════════
```

### Slack Notification

You'll receive a beautifully formatted message in Slack with:
- 🆕 Header with "New Polymarket Market Detected"
- **Market question** in bold
- **Details grid**: Category, End Date, Prices, Volume, Liquidity
- **Condition ID** in code block
- 📊 **"View Market" button** linking to Polymarket
- Timestamp of detection

## 🎯 Optional: Market Filtering

To monitor only specific markets, enable filtering in `.env`:

```bash
# Enable filtering
ENABLE_FILTERING=true

# Filter by categories (comma-separated)
FILTER_CATEGORIES=crypto,politics

# Filter by keywords in question
FILTER_KEYWORDS=Bitcoin,Trump,election

# Filter by minimum liquidity (USD)
FILTER_MIN_LIQUIDITY=1000

# Filter by minimum volume (USD)
FILTER_MIN_VOLUME=500
```

**Example**: Monitor only crypto markets with "Bitcoin" or "Ethereum" in the question and at least $1000 liquidity:

```bash
ENABLE_FILTERING=true
FILTER_CATEGORIES=crypto
FILTER_KEYWORDS=Bitcoin,Ethereum
FILTER_MIN_LIQUIDITY=1000
```

## 🐳 Docker Deployment

### Basic Deployment

```bash
# Start the monitor
docker-compose up -d

# View logs in real-time
docker-compose logs -f

# Check container status
docker ps

# Stop the monitor
docker-compose down
```

### Production Deployment

For production servers (VPS, AWS EC2, etc.):

```bash
# 1. Clone the repository
git clone <your-repo>
cd poly-sdk/monitor

# 2. Set up environment
cp .env.example .env
nano .env  # Fill in your credentials

# 3. Build and start
docker-compose up -d

# 4. Verify it's running
docker-compose ps
docker-compose logs --tail=50

# 5. Set up auto-restart on boot
# Docker Compose will automatically restart unless stopped
```

### Resource Management

The Docker Compose config includes resource limits:
- **CPU**: 0.5-1.0 cores
- **Memory**: 256-512 MB

Adjust in `docker-compose.yml` if needed:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'      # Increase if needed
      memory: 1024M  # Increase if needed
```

## Project Structure

```
monitor/
├── src/
│   ├── index.ts                  # Polymarket entry point
│   ├── kalshi-index.ts           # Kalshi entry point
│   ├── daily-reporter.ts         # Polymarket daily reporter
│   ├── kalshi-daily-reporter.ts  # Kalshi daily reporter
│   ├── monitor.ts                # Real-time monitoring (legacy)
│   ├── config.ts                 # Configuration loader
│   ├── types.ts                  # TypeScript types
│   └── services/
│       ├── slack-notifier.ts     # Slack integration
│       └── supabase-storage.ts   # Database operations
├── supabase/
│   ├── README.md                 # Supabase setup guide
│   └── migrations/
│       ├── 001_create_markets_table.sql      # Polymarket table
│       └── 002_create_kalshi_markets_table.sql # Kalshi table
├── .env.example                  # Environment template
├── docker-compose.yml            # Docker Compose config
├── Dockerfile                    # Docker image definition
├── package.json                  # NPM dependencies
├── tsconfig.json                 # TypeScript config
└── README.md                     # This file
```

## Database Schema

### Polymarket Markets Table (`polymarket_markets`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Auto-incrementing primary key |
| `condition_id` | TEXT | Unique market identifier |
| `question` | TEXT | Market question |
| `category` | TEXT | Market category |
| `slug` | TEXT | URL slug |
| `end_date` | TIMESTAMPTZ | Market end date |
| `volume` | DECIMAL | Trading volume (USD) |
| `liquidity` | DECIMAL | Liquidity (USD) |
| `initial_yes_price` | DECIMAL | YES token price |
| `initial_no_price` | DECIMAL | NO token price |
| `detected_at` | TIMESTAMPTZ | Detection timestamp |
| `slack_notified` | BOOLEAN | Slack notification sent? |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Last update time |

### Kalshi Markets Table (`kalshi_markets`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Auto-incrementing primary key |
| `ticker` | TEXT | Unique market ticker |
| `event_ticker` | TEXT | Parent event ticker |
| `title` | TEXT | Market title |
| `subtitle` | TEXT | Market subtitle |
| `category` | TEXT | Derived category |
| `close_time` | TIMESTAMPTZ | Market close time |
| `volume` | DECIMAL | Total contracts traded |
| `volume_24h` | DECIMAL | 24h volume |
| `liquidity` | DECIMAL | Available liquidity |
| `yes_price` | DECIMAL | YES price (0-1) |
| `no_price` | DECIMAL | NO price (0-1) |
| `detected_at` | TIMESTAMPTZ | Detection timestamp |
| `slack_notified` | BOOLEAN | Slack notification sent? |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Last update time |

**Indexes**: Optimized for queries on primary identifiers, `detected_at`, `category`, and volume.

## 🔍 Querying Your Data

### Via Supabase Dashboard

1. Go to your Supabase project
2. Click **"Table Editor"** → `polymarket_markets`
3. Browse, filter, and search your markets

### Via SQL Editor

```sql
-- Get latest 10 markets
SELECT question, category, volume, detected_at
FROM polymarket_markets
ORDER BY detected_at DESC
LIMIT 10;

-- Get markets by category
SELECT question, volume, liquidity
FROM polymarket_markets
WHERE category = 'crypto'
ORDER BY detected_at DESC;

-- Get high-volume markets
SELECT question, volume, initial_yes_price
FROM polymarket_markets
WHERE volume > 10000
ORDER BY volume DESC;

-- Daily market count
SELECT DATE(detected_at) as date, COUNT(*) as markets
FROM polymarket_markets
GROUP BY DATE(detected_at)
ORDER BY date DESC;
```

## 🛠️ Troubleshooting

### "Missing required environment variables"
- Check that `.env` exists and has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Make sure you're using the **service_role** key, not the `anon` key

### "Supabase connection failed"
- Verify your Supabase URL is correct
- Check that the migration was run successfully
- Test connection in Supabase SQL Editor: `SELECT 1;`

### "Slack connection failed"
- Verify your webhook URL is correct
- Test it manually:
  ```bash
  curl -X POST YOUR_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d '{"text":"Test message"}'
  ```

### Markets not appearing
- Check console logs for errors
- Verify WebSocket connection: Should see "✅ Connected to Polymarket"
- New markets are rare - may take hours/days between detections
- Test filtering: disable `ENABLE_FILTERING` to see all markets

### Docker container keeps restarting
- Check logs: `docker-compose logs`
- Verify `.env` file exists and has correct values
- Check container health: `docker-compose ps`

## 🔐 Security Best Practices

1. **Never commit `.env`** - It's in `.gitignore` by default
2. **Use service_role key carefully** - It has full database access
3. **Rotate keys periodically** - Generate new Supabase keys every few months
4. **Restrict Slack webhook** - Only you should have the webhook URL
5. **Use Docker in production** - Isolated environment with resource limits
6. **Monitor logs** - Set up log rotation to prevent disk filling

## 📈 Performance & Scaling

- **CPU Usage**: Very low (~5-10% on idle, spikes on new markets)
- **Memory**: ~100-200 MB typical usage
- **Network**: Persistent WebSocket connection (minimal bandwidth)
- **Database**: Inserts are infrequent (1-50 per day typically)
- **Scaling**: Single instance is sufficient for all Polymarket markets

## 🆘 Getting Help

1. **Check logs**: `docker-compose logs -f` or `npm run dev`
2. **Verify setup**: Reread `supabase/README.md`
3. **Test connections**: Monitor shows connection status on startup
4. **Review .env**: Compare with `.env.example`

## 📜 License

MIT License - see main repository for details

## 🙏 Acknowledgments

Built with:
- [@catalyst-team/poly-sdk](https://github.com/cyl19970726/poly-sdk) - Polymarket SDK
- [Supabase](https://supabase.com) - Database & storage
- [Slack API](https://api.slack.com) - Notifications

---

**Made with ❤️ for the Polymarket community**
