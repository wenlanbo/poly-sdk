#!/bin/bash
# Quick setup script for Polymarket Market Monitor

set -e

echo "═══════════════════════════════════════════════════════"
echo "🚀 Polymarket Market Monitor - Quick Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# Check if .env exists
if [ -f .env ]; then
  echo "⚠️  .env file already exists!"
  read -p "Do you want to overwrite it? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled. Using existing .env file."
    exit 0
  fi
fi

# Copy .env.example to .env
echo "📝 Creating .env file..."
cp .env.example .env

echo ""
echo "✅ .env file created!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Set up Supabase:"
echo "   - Read: supabase/README.md"
echo "   - Create project at https://supabase.com"
echo "   - Run the migration (copy/paste SQL)"
echo "   - Get your URL and Service Key"
echo ""
echo "2. Set up Slack webhook:"
echo "   - Go to https://api.slack.com/apps"
echo "   - Create new app → Incoming Webhooks"
echo "   - Add webhook to workspace"
echo "   - Copy webhook URL"
echo ""
echo "3. Edit .env file:"
echo "   - Run: nano .env (or use your editor)"
echo "   - Fill in SUPABASE_URL"
echo "   - Fill in SUPABASE_SERVICE_KEY"
echo "   - Fill in SLACK_WEBHOOK_URL"
echo "   - Set SLACK_ENABLED=true"
echo ""
echo "4. Install dependencies:"
echo "   - Run: npm install"
echo ""
echo "5. Start the monitor:"
echo "   - Docker: docker-compose up -d"
echo "   - Or Node: npm run dev"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 Full documentation: README.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
