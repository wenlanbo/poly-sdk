# Supabase Setup Guide

This guide will help you set up Supabase for the Polymarket Market Monitor.

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: `polymarket-monitor` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your server location
5. Click **"Create new project"** and wait ~2 minutes for setup

## Step 2: Run the Database Migration

### Option A: Using Supabase Dashboard (Easiest)

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy the entire contents of `migrations/001_create_markets_table.sql`
4. Paste into the SQL editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. You should see: ✅ "Success. No rows returned"

### Option B: Using Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migration
supabase db push
```

## Step 3: Get Your Connection Details

You need two values for your `.env` file:

### 1. **Supabase URL**
- In your project dashboard, go to **Settings** → **API**
- Copy the **Project URL** (looks like: `https://xxxxx.supabase.co`)

### 2. **Supabase Service Role Key** (Important: Use service role, not anon key!)
- In the same **Settings** → **API** page
- Scroll down to **Project API keys**
- Copy the **`service_role`** key (not the `anon` key!)
- ⚠️ **Keep this secret!** It has full database access

## Step 4: Verify the Setup

After running the migration, verify the table was created:

1. Go to **Table Editor** (left sidebar)
2. You should see `polymarket_markets` table
3. Click on it to see the columns:
   - `id`, `condition_id`, `question`, `category`, etc.

## Step 5: Configure Your Monitor

Add these to your `.env` file:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...your-service-role-key
```

## Database Schema

The `polymarket_markets` table stores:

**Core Fields:**
- `condition_id` - Unique market identifier
- `question` - Market question/title
- `category` - Market category
- `slug` - URL-friendly slug

**Financial Data:**
- `volume` - Trading volume (USD)
- `liquidity` - Available liquidity (USD)
- `initial_yes_price` - Initial YES token price
- `initial_no_price` - Initial NO token price

**Tracking:**
- `detected_at` - When we first saw this market
- `slack_notified` - Whether Slack notification sent
- `raw_event_data` - Full JSON event data

## Troubleshooting

### Error: "permission denied for table polymarket_markets"
- Make sure you're using the **service_role** key, not the `anon` key

### Error: "relation polymarket_markets does not exist"
- The migration didn't run. Go back to Step 2

### Can't find Project URL or API keys
- Go to your project → **Settings** (gear icon) → **API**

## Testing the Connection

Once your monitor is running, you can view the data:

1. **Via Supabase Dashboard**: Table Editor → `polymarket_markets`
2. **Via SQL**: Run queries in SQL Editor
   ```sql
   SELECT * FROM polymarket_markets ORDER BY detected_at DESC LIMIT 10;
   ```

## Need Help?

- Check Supabase docs: https://supabase.com/docs
- If you get errors, share the error message and I'll help debug!
