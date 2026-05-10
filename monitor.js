#!/usr/bin/env node
/**
 * Web3 Multi-Chain Wallet Balance Monitor
 *
 * Supports: EVM (40+ chains), Solana, Sui, Cosmos ecosystem
 *
 * First run:  scans all addresses, records baseline balances
 * Next runs:  compares with saved state, logs any balance changes
 *
 * Usage:
 *   node monitor.js --input addresses.txt
 *   node monitor.js --input addresses.txt --interval 60
 *   node monitor.js --input addresses.txt --chains eth,sol,atom
 *   node monitor.js --input addresses.txt --notify
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { CHAINS } = require('./chains');
const { loadConfig, isWhitelisted } = require('./config-loader');

// ─── ANSI Colors ───
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m', bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m', magenta: '\x1b[35m',
};
const log = console.log;
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ─── Paths ───
const STATE_FILE = path.join(__dirname, 'balance-state.json');
const CHANGELOG = path.join(__dirname, 'balance-changes.jsonl');

// ─── Config ───
const config = {
  inputFile: null,
  chains: null,
  includeTestnets: false,
  concurrency: 5,
  timeout: 10000,
  interval: 0,
  notify: false,
  stateFile: STATE_FILE,
};

// ─── Parse Args ───
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-i': case '--input':
        config.inputFile = args[++i]; break;
      case '-c': case '--chains':
        config.chains = args[++i].split(',').map(s => s.trim().toLowerCase()); break;
      case '--testnets':
        config.includeTestnets = true; break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i], 10) || 5; break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10) || 10000; break;
      case '--interval': case '--loop':
        config.interval = parseInt(args[++i], 10) || 0; break;
      case '--notify':
        config.notify = true; break;
      case '--state':
        config.stateFile = args[++i]; break;
      case '-h': case '--help':
        printHelp(); process.exit(0);
    }
  }
  if (!config.inputFile) {
    log(`${C.red}Error: --input FILE required (address list)${C.reset}`);
    log(`  Run with --help for usage`);
    process.exit(1);
  }
}

function printHelp() {
  log(`
${C.bold}Web3 Multi-Chain Wallet Balance Monitor${C.reset}

${C.cyan}Usage:${C.reset}
  node monitor.js --input addresses.txt [options]

${C.cyan}Options:${C.reset}
  -i, --input FILE      Address file (required, one per line)
  -c, --chains LIST     Comma-separated chains (default: all from config.env)
  --interval N          Re-scan every N seconds (default: 0 = one-shot)
  --notify              Send Telegram notification on balance changes
  --state FILE          Custom state file path
  --testnets            Include testnet chains
  --concurrency N       Parallel chain RPCs (default: 5)
  --timeout MS          RPC timeout ms (default: 10000)
  -h, --help            Show help

${C.cyan}Supported chains:${C.reset}
  EVM:       eth, bsc, polygon, arbitrum, base, optimism, ... (40+ chains)
  Solana:    sol
  Sui:       sui
  Cosmos:    atom, osmo (Osmosis), tia (Celestia), inj (Injective), dydx

${C.cyan}Address file format:${C.reset}
  0x1234...abcd                     # EVM address (40 hex chars)
  0x1234...abcdef0123456789         # Sui address (64 hex chars)
  7xKX...solanaAddress              # Solana address (base58)
  cosmos1abc...xyz                  # Cosmos bech32 address
  osmo1abc...xyz                    # Osmosis address

  # Mixed example:
  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
  cosmos1abc...
`);
}

// ─── Address type detection ───
function detectAddressType(address) {
  // EVM: 0x + 40 hex chars
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  // Sui: 0x + 64 hex chars (or shorter with leading zeros trimmed)
  if (/^0x[0-9a-fA-F]{1,64}$/.test(address) && address.length >= 3 && address.length <= 66) {
    // Distinguish from EVM: if it's >42 chars (0x + more than 40), it's Sui
    if (address.length > 42) return 'sui';
    // Short Sui addresses (0x + less than 40 hex) are also Sui
    // But 0x + exactly 40 is EVM, so 0x + < 40 hex could be Sui
    if (address.length < 42) return 'sui';
  }
  // Solana: base58, 32-44 chars, no 0x prefix
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'solana';
  // Cosmos ecosystem: bech32 prefixes
  if (/^(cosmos|osmo|celestia|inj|dydx)1[a-z0-9]{38,}$/.test(address)) return 'cosmos';
  return null;
}

// ─── Chain filtering ───
function getActiveChains() {
  let chains = CHAINS;
  if (!config.includeTestnets) chains = chains.filter(c => !c.testnet);
  if (config.chains) {
    chains = chains.filter(c => {
      const lower = c.name.toLowerCase();
      const aliases = (c.aliases || []).map(a => a.toLowerCase());
      return config.chains.some(f => lower.includes(f) || lower === f || aliases.includes(f));
    });
  }
  return chains;
}

// ─── Match chains to an address ───
function chainsForAddress(address, allChains) {
  const type = detectAddressType(address);
  if (!type) return [];
  return allChains.filter(c => c.type === type);
}

// ─── Load addresses from file ───
function loadAddresses(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const wallets = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/[,\t]/).map(s => s.trim());
    let address = null, privateKey = null;

    for (const part of parts) {
      // Private key (EVM)
      if (/^0x[0-9a-fA-F]{64,66}$/.test(part)) {
        privateKey = part;
        try { address = new ethers.Wallet(part).address; } catch {}
      }
    }

    // Find address: first valid address-like string
    if (!address) {
      for (const part of parts) {
        if (detectAddressType(part)) {
          address = part;
          break;
        }
      }
    }

    if (address) {
      const type = detectAddressType(address);
      wallets.push({ address, privateKey, type });
    }
  }
  return wallets;
}

// ─── Load / Save state ───
function loadState() {
  if (!fs.existsSync(config.stateFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

// ─── Append to changelog ───
function appendChange(entry) {
  fs.appendFileSync(CHANGELOG, JSON.stringify(entry) + '\n');
}

// ─── Balance checkers per chain type ───

// EVM: batch eth_getBalance via JSON-RPC
async function evmBatchGetBalances(chain, addresses) {
  const batch = addresses.map((addr, i) => ({
    jsonrpc: '2.0', id: i + 1,
    method: 'eth_getBalance', params: [addr, 'latest'],
  }));
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), config.timeout);
    const resp = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: controller.signal,
    });
    clearTimeout(tid);
    const results = await resp.json();
    const map = {};
    if (Array.isArray(results)) {
      for (const r of results) map[r.id - 1] = r.result || '0x0';
    }
    return map;
  } catch (err) {
    const map = {};
    for (let i = 0; i < addresses.length; i++) map[i] = '0x0';
    map._error = err.message.slice(0, 100);
    return map;
  }
}

// Solana: getBalance (one at a time, batch with Promise.all)
async function solanaGetBalances(chain, addresses) {
  const results = {};
  const fetchOne = async (addr, idx) => {
    const body = {
      jsonrpc: '2.0', id: idx + 1,
      method: 'getBalance', params: [addr],
    };
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), config.timeout);
      const resp = await fetch(chain.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await resp.json();
      results[idx] = data.result ? data.result.value.toString() : '0';
    } catch {
      results[idx] = '0';
    }
  };
  await Promise.all(addresses.map((a, i) => fetchOne(a, i)));
  return results;
}

// Sui: sui_getBalance
async function suiGetBalances(chain, addresses) {
  const results = {};
  const fetchOne = async (addr, idx) => {
    const body = {
      jsonrpc: '2.0', id: idx + 1,
      method: 'sui_getBalance',
      params: [addr, '0x2::sui::SUI'],  // SUI native token type
    };
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), config.timeout);
      const resp = await fetch(chain.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const data = await resp.json();
      if (data.result && data.result.totalBalance) {
        results[idx] = data.result.totalBalance;
      } else {
        results[idx] = '0';
      }
    } catch {
      results[idx] = '0';
    }
  };
  await Promise.all(addresses.map((a, i) => fetchOne(a, i)));
  return results;
}

// Cosmos: REST LCD query
async function cosmosGetBalances(chain, addresses) {
  const results = {};
  const fetchOne = async (addr, idx) => {
    const url = `${chain.rpc}/cosmos/bank/v1beta1/balances/${addr}`;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), config.timeout);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      const data = await resp.json();
      if (data.balances) {
        const native = data.balances.find(b => b.denom === chain.denom);
        results[idx] = native ? native.amount : '0';
      } else {
        results[idx] = '0';
      }
    } catch {
      results[idx] = '0';
    }
  };
  await Promise.all(addresses.map((a, i) => fetchOne(a, i)));
  return results;
}

// ─── Unified balance fetcher ───
async function getBalances(chain, addresses) {
  switch (chain.type) {
    case 'evm':    return evmBatchGetBalances(chain, addresses);
    case 'solana': return solanaGetBalances(chain, addresses);
    case 'sui':    return suiGetBalances(chain, addresses);
    case 'cosmos': return cosmosGetBalances(chain, addresses);
    default:
      const map = {};
      for (let i = 0; i < addresses.length; i++) map[i] = '0';
      return map;
  }
}

// ─── Convert raw balance to human-readable ───
function formatBalance(rawStr, decimals) {
  if (!rawStr || rawStr === '0') return '0';
  const raw = BigInt(rawStr);
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

// ─── Scan all wallets across chains ───
async function scanAll(wallets, allChains) {
  // Group chains by type for efficient batching
  const chainsByType = {};
  for (const chain of allChains) {
    if (!chainsByType[chain.type]) chainsByType[chain.type] = [];
    chainsByType[chain.type].push(chain);
  }

  // For each address, only check chains matching its type
  // Collect all (address, chain) pairs to check
  const tasks = []; // { walletIdx, chain }
  for (let wi = 0; wi < wallets.length; wi++) {
    const w = wallets[wi];
    const matchingChains = allChains.filter(c => c.type === w.type);
    for (const chain of matchingChains) {
      tasks.push({ walletIdx: wi, chain });
    }
  }

  // Group tasks by chain for batch processing
  const tasksByChain = {};
  for (const t of tasks) {
    const key = t.chain.name;
    if (!tasksByChain[key]) tasksByChain[key] = { chain: t.chain, walletIdxs: [], addresses: [] };
    tasksByChain[key].walletIdxs.push(t.walletIdx);
    tasksByChain[key].addresses.push(wallets[t.walletIdx].address);
  }

  // Process chains in concurrency batches
  const chainNames = Object.keys(tasksByChain);
  const rawResults = {}; // { chainName -> { walletIdx -> rawBalance } }

  for (let i = 0; i < chainNames.length; i += config.concurrency) {
    const batch = chainNames.slice(i, i + config.concurrency);
    const results = await Promise.all(batch.map(async name => {
      const { chain, walletIdxs, addresses } = tasksByChain[name];
      const balances = await getBalances(chain, addresses);
      // Map walletIdx -> balance
      const mapped = {};
      for (let j = 0; j < walletIdxs.length; j++) {
        mapped[walletIdxs[j]] = balances[j] || '0';
      }
      return { name, chain, balances: mapped };
    }));
    for (const r of results) rawResults[r.name] = r;
  }

  // Build per-address result
  const addrResults = {};
  for (let wi = 0; wi < wallets.length; wi++) {
    const addr = wallets[wi].address;
    addrResults[addr] = {};
    for (const chainName of Object.keys(rawResults)) {
      const cr = rawResults[chainName];
      if (!(wi in cr.balances)) continue; // this address wasn't checked for this chain
      const raw = cr.balances[wi] || '0';
      const human = formatBalance(raw, cr.chain.decimals);
      addrResults[addr][chainName] = {
        type: cr.chain.type,
        symbol: cr.chain.symbol,
        decimals: cr.chain.decimals,
        balance: human,
        raw: raw,
      };
    }
  }
  return addrResults;
}

// ─── Diff current vs saved state ───
function diffState(prev, curr) {
  const changes = [];

  for (const addr of Object.keys(curr)) {
    const currChains = curr[addr];
    const prevChains = prev[addr] || {};

    for (const chainName of Object.keys(currChains)) {
      const cur = currChains[chainName];
      const prv = prevChains[chainName] || { raw: '0', balance: '0', symbol: cur.symbol };

      if (cur.raw !== prv.raw) {
        const curRaw = BigInt(cur.raw);
        const prvRaw = BigInt(prv.raw);
        const diff = curRaw - prvRaw;
        const decimals = cur.decimals || 18;
        changes.push({
          address: addr,
          chain: chainName,
          symbol: cur.symbol,
          type: cur.type,
          prevBalance: prv.balance,
          newBalance: cur.balance,
          prevRaw: prv.raw,
          newRaw: cur.raw,
          diffRaw: diff.toString(),
          diffHuman: formatBalance(diff < 0n ? (-diff).toString() : diff.toString(), decimals),
          direction: diff > 0n ? 'INCREASE' : diff < 0n ? 'DECREASE' : 'SAME',
        });
      }
    }
  }
  return changes;
}

// ─── Telegram notification ───
async function sendTelegram(text) {
  const envPath = '/opt/data/.env';
  if (!fs.existsSync(envPath)) return;
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  const token = env.TG_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID || env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    log(`${C.yellow}⚠ Telegram send failed: ${err.message}${C.reset}`);
  }
}

// ─── Format change for display ───
function formatChange(c) {
  const arrow = c.direction === 'INCREASE' ? '↑' : '↓';
  const color = c.direction === 'INCREASE' ? C.green : C.red;
  const shortAddr = c.address.length > 20
    ? `${c.address.slice(0, 6)}...${c.address.slice(-4)}`
    : c.address;
  const sign = c.direction === 'INCREASE' ? '+' : '-';
  return `  ${color}${arrow}${C.reset} ${shortAddr} | ${c.chain} (${c.symbol}): ${c.prevBalance} -> ${C.bold}${color}${c.newBalance}${C.reset} (${sign}${c.diffHuman})`;
}

// ─── One scan cycle ───
async function runCycle(wallets, chains) {
  const now = ts();
  const prevState = loadState();
  const hasPrev = Object.keys(prevState).length > 0;

  if (!hasPrev) {
    log(`${C.cyan}[${now}]${C.reset} ${C.bold}First run — recording baseline balances...${C.reset}`);
  } else {
    log(`${C.cyan}[${now}]${C.reset} Scanning for balance changes...`);
  }

  const current = await scanAll(wallets, chains);

  if (!hasPrev) {
    saveState(current);

    let totalNonZero = 0;
    for (const addr of Object.keys(current)) {
      for (const ch of Object.keys(current[addr])) {
        const entry = current[addr][ch];
        if (entry.raw !== '0') {
          totalNonZero++;
          const shortAddr = addr.length > 20 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
          log(`  ${C.green}✓${C.reset} ${shortAddr} | ${ch} (${entry.symbol}): ${C.bold}${entry.balance}${C.reset}`);
        }
      }
    }
    if (totalNonZero === 0) {
      log(`  ${C.dim}All ${wallets.length} addresses have zero balance across ${chains.length} chains${C.reset}`);
    }
    log(`\n  ${C.dim}Baseline saved to: ${config.stateFile}${C.reset}`);
    log(`  ${C.dim}Addresses: ${wallets.length} | Chains: ${chains.length}${C.reset}`);
    return;
  }

  const changes = diffState(prevState, current);

  if (changes.length === 0) {
    log(`  ${C.dim}No balance changes detected.${C.reset}`);
    return;
  }

  log(`\n  ${C.bgYellow}${C.bold} BALANCE CHANGES DETECTED: ${changes.length} ${C.reset}\n`);
  for (const c of changes) {
    log(formatChange(c));
  }

  const changeEntry = { timestamp: new Date().toISOString(), changes };
  appendChange(changeEntry);
  saveState(current);

  log(`\n  ${C.dim}State updated. Changelog: ${CHANGELOG}${C.reset}`);

  if (config.notify) {
    let msg = `<b>🔔 Balance Change Alert</b>\n<i>${now}</i>\n\n`;
    for (const c of changes) {
      const arrow = c.direction === 'INCREASE' ? '⬆️' : '⬇️';
      const shortAddr = c.address.length > 20 ? `${c.address.slice(0, 6)}...${c.address.slice(-4)}` : c.address;
      const sign = c.direction === 'INCREASE' ? '+' : '-';
      msg += `${arrow} <code>${shortAddr}</code> | ${c.chain} (${c.symbol})\n`;
      msg += `   ${c.prevBalance} → <b>${c.newBalance}</b> (${sign}${c.diffHuman})\n\n`;
    }
    await sendTelegram(msg);
    log(`  ${C.dim}Telegram notification sent.${C.reset}`);
  }
}

// ─── Main ───
async function main() {
  parseArgs();

  const appConfig = loadConfig();
  if (!config.chains && appConfig.chains) config.chains = appConfig.chains;
  const allChains = getActiveChains();
  const wallets = loadAddresses(config.inputFile);

  if (wallets.length === 0) {
    log(`${C.red}No valid addresses found in ${config.inputFile}${C.reset}`);
    process.exit(1);
  }

  // For each address, find matching chains
  let totalChecks = 0;
  for (const w of wallets) {
    const matching = allChains.filter(c => c.type === w.type);
    totalChecks += matching.length;
  }

  // Count chains by type
  const typeCounts = {};
  for (const c of allChains) {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  }
  const typeSummary = Object.entries(typeCounts).map(([t, n]) => `${t}(${n})`).join(', ');

  log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║     Web3 Multi-Chain Wallet Balance Monitor         ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  log(`  ${C.dim}Time:${C.reset}         ${ts()}`);
  log(`  ${C.dim}Addresses:${C.reset}    ${C.white}${wallets.length}${C.reset}`);
  log(`  ${C.dim}Chains:${C.reset}       ${C.white}${allChains.length}${C.reset} (${typeSummary})`);
  log(`  ${C.dim}Checks:${C.reset}       ${C.white}${totalChecks}${C.reset}`);
  log(`  ${C.dim}Interval:${C.reset}     ${C.white}${config.interval > 0 ? config.interval + 's' : 'one-shot'}${C.reset}`);
  log(`  ${C.dim}State file:${C.reset}   ${C.white}${config.stateFile}${C.reset}`);
  log(`  ${C.dim}Notify:${C.reset}       ${C.white}${config.notify ? 'Telegram ON' : 'OFF'}${C.reset}`);
  log(`${'─'.repeat(60)}`);

  if (config.interval > 0) {
    log(`${C.dim}Running in continuous mode (Ctrl+C to stop)${C.reset}\n`);
    while (true) {
      await runCycle(wallets, allChains);
      log(`\n  ${C.dim}Next scan in ${config.interval}s...${C.reset}\n`);
      await new Promise(r => setTimeout(r, config.interval * 1000));
    }
  } else {
    await runCycle(wallets, allChains);
  }
}

main().catch(err => {
  log(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
