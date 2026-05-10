# Web3 Wallet Balance Monitor

Multi-chain EVM wallet balance monitor. Tracks balance changes across 40+ networks.

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
node monitor.js --input addresses.txt --chains eth,bsc,arbitrum

# Telegram notification on changes
node monitor.js --input addresses.txt --interval 60 --notify
```

## Address File Format

One address per line. Supports comments and CSV:

```
# My wallets
0x1234...abcd
0x5678...ef01,0xdead...beef   # address, private_key
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

Set `TG_BOT_TOKEN` and `TG_CHAT_ID` in `/opt/data/.env` (shared with other tools).
