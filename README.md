# Web3 Multi-Chain Wallet Balance Monitor

Multi-chain wallet balance monitor — tracks balance changes across 48+ networks.

Supports: **EVM** (41 chains), **Solana**, **Sui**, **Cosmos ecosystem** (ATOM, OSMO, TIA, INJ, DYDX).

## How It Works

1. **First run** — scans all addresses, saves baseline balances to `balance-state.json`
2. **Next runs** — compares current balances with saved state, logs any changes
3. Changes are appended to `balance-changes.jsonl` (one JSON object per line)

## Install

```bash
npm install
```

## Quick Start

```bash
# 1. Edit wallets.env with your addresses
# 2. Run
node monitor.js

# Or with options
node monitor.js --interval 60 --notify
```

## Wallet Configuration (wallets.env)

Each address on one line, optionally specify which chains to monitor:

```bash
# Monitor specific chains only
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 = eth, arbitrum, base

# Monitor all EVM chains (omit chain list)
0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8

# Non-EVM chains
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU = sol
cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02 = atom, osmo
```

Chain aliases: `eth`, `arb`/`arbitrum`, `base`, `op`/`optimism`, `bsc`, `polygon`/`matic`, `avax`, `sol`, `sui`, `atom`, `osmo`, `tia`, `inj`, `dydx`, etc.

If `wallets.env` has no uncommented addresses, falls back to `addresses.txt` (one address per line).

## Usage

```bash
# Auto-detect wallets.env
node monitor.js

# Use wallets.env with continuous monitoring
node monitor.js --interval 60

# Use simple address list instead
node monitor.js --input addresses.txt

# Use a custom wallets file
node monitor.js --wallets my-wallets.env

# Only specific chains (global filter, overrides per-address config)
node monitor.js --chains eth,sol,atom

# Telegram notification on changes
node monitor.js --interval 60 --notify
```

## Supported Chains

| Type | Chains | Count |
|------|--------|-------|
| EVM | Ethereum, Arbitrum, Base, Optimism, BSC, Polygon, Avalanche, ... | 41 |
| Solana | Solana | 1 |
| Sui | Sui | 1 |
| Cosmos | Cosmos Hub, Osmosis, Celestia, Injective, dYdX | 5 |

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-w, --wallets FILE` | wallets.env | Wallet config with per-address chains |
| `-i, --input FILE` | addresses.txt | Simple address list (all chains) |
| `-c, --chains LIST` | all | Global chain filter |
| `--interval N` | 0 (one-shot) | Re-scan interval in seconds |
| `--notify` | off | Send Telegram on changes |
| `--testnets` | off | Include testnet chains |
| `--concurrency N` | 5 | Parallel chain RPCs |
| `--timeout MS` | 10000 | RPC timeout |

## Output Files

- `balance-state.json` — current balance snapshot (updated each scan)
- `balance-changes.jsonl` — change history (append-only)

## Telegram Notifications

Set `TG_BOT_TOKEN` and `TG_CHAT_ID` in `/opt/data/.env`.
