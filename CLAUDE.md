# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Build
pnpm build          # TypeScript compilation (tsc)

# Testing
pnpm test           # Run unit tests (vitest)
pnpm test:watch     # Run tests in watch mode
pnpm test:integration  # Run integration tests (requires API access)

# Run a single test file
pnpm vitest run src/core/types.test.ts
pnpm vitest run src/utils/price-utils.test.ts

# Run examples (useful for testing functionality)
pnpm example:basic       # Basic market data usage
pnpm example:trading     # Trading orders
pnpm example:realtime    # WebSocket feeds
pnpm example:arb-service # Arbitrage service
```

## Architecture

This is a TypeScript SDK for Polymarket organized in three layers:

### Layer 1: Core Infrastructure (`src/core/`)
- `rate-limiter.ts` - Per-API rate limiting using Bottleneck
- `cache.ts` - TTL-based caching with pluggable adapters
- `errors.ts` - Structured errors with retry logic
- `types.ts` - Core types (UnifiedMarket, ProcessedOrderbook, KLine, etc.)

### Layer 2: Low-Level API Clients (`src/clients/`)
- `gamma-api.ts` - Gamma API (markets, events, search)
- `data-api.ts` - Data API (positions, trades, leaderboard)
- `subgraph.ts` - On-chain data via Goldsky subgraphs
- `ctf-client.ts` - CTF contract operations (split/merge/redeem)
- `bridge-client.ts` - Cross-chain deposits

### Layer 3: High-Level Services (`src/services/`)
- `trading-service.ts` - Order management via @polymarket/clob-client
- `market-service.ts` - Market data, K-lines, orderbook analysis
- `realtime-service-v2.ts` - WebSocket real-time data via @polymarket/real-time-data-client
- `wallet-service.ts` - Wallet analysis, smart scores
- `smart-money-service.ts` - Smart money tracking, copy trading
- `arbitrage-service.ts` - Arbitrage detection and execution
- `dip-arb-service.ts` - Dip arbitrage for 15m crypto markets
- `onchain-service.ts` - Unified on-chain ops (CTF + approvals + swaps)

### Entry Point (`src/index.ts`)
The `PolymarketSDK` class integrates all services and provides convenience methods like `getMarket()`, `getOrderbook()`, and `detectArbitrage()`.

## Key Concepts

### Polymarket Orderbook Mirror Property
Polymarket orderbooks have a mirror property: `Buy YES @ P = Sell NO @ (1-P)`. The same order appears in both orderbooks. Use `getEffectivePrices()` from `price-utils.ts` to avoid double-counting when calculating arbitrage.

### USDC.e vs Native USDC
Polymarket CTF requires **USDC.e** (bridged, 0x2791...), not native USDC. The `USDC_CONTRACT` export is USDC.e.

### SDK Initialization Pattern
```typescript
// Recommended: static factory
const sdk = await PolymarketSDK.create({ privateKey: '0x...' });

// Or manual: new + start()
const sdk = new PolymarketSDK({ privateKey });
await sdk.start();  // initialize + connect WebSocket
```

## Test Structure

- Unit tests: `src/**/*.test.ts` (co-located with source)
- Integration tests: `src/__tests__/integration/*.integration.test.ts`

Integration tests require `PRIVATE_KEY` env var and make real API calls.
