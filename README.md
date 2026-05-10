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

## Usage

```bash
# One-shot scan
node monitor.js --input addresses.txt

# Continuous monitoring (every 60 seconds)
node monitor.js --input addresses.txt --interval 60

# Only specific chains
node monitor.js --input addresses.txt --chains eth,sol,atom

# Telegram notification on changes
node monitor.js --input addresses.txt --interval 60 --notify
```

## Supported Chains

| Type | Chains | Count |
|------|--------|-------|
| EVM | Ethereum, Arbitrum, Base, Optimism, BSC, Polygon, Avalanche, ... | 41 |
| Solana | Solana | 1 |
| Sui | Sui | 1 |
| Cosmos | Cosmos Hub, Osmosis, Celestia, Injective, dYdX | 5 |

Use `--chains` to filter: `eth`, `arb`, `bsc`, `sol`, `sui`, `atom`, `osmo`, `tia`, `inj`, `dydx`, etc.

## Address File Format

One address per line. Address type is auto-detected:

```
# EVM (0x + 40 hex chars)
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Solana (base58, 32-44 chars)
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Sui (0x + up to 64 hex chars)
0x0000000000000000000000000000000000000000000000000000000000000002

# Cosmos ecosystem (bech32)
cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02
osmo1abc...
celestia1abc...
inj1abc...
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-i, --input FILE` | required | Address file |
| `-c, --chains LIST` | all | Comma-separated chain filter |
| `--interval N` | 0 (one-shot) | Re-scan interval in seconds |
| `--notify` | off | Send Telegram on changes |
| `--testnets` | off | Include testnet chains |
| `--concurrency N` | 5 | Parallel chain RPCs |
| `--timeout MS` | 10000 | RPC timeout |
| `--state FILE` | balance-state.json | Custom state file path |

## Output Files

- `balance-state.json` — current balance snapshot (updated each scan)
- `balance-changes.jsonl` — change history (append-only)

## Telegram Notifications

Set `TG_BOT_TOKEN` and `TG_CHAT_ID` in `/opt/data/.env`.
