#!/usr/bin/env node
/**
 * Web3 Wallet Balance Monitor
 *
 * First run:  scans all addresses, records baseline balances
 * Next runs:  compares with saved state, logs any balance changes
 *
 * Usage:
 *   node monitor.js --input addresses.txt
 *   node monitor.js --input addresses.txt --interval 60
 *   node monitor.js --input addresses.txt --chains eth,bsc
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
  interval: 0,        // 0 = one-shot, >0 = loop seconds
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
${C.bold}Web3 Wallet Balance Monitor${C.reset}

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

${C.cyan}Address file format:${C.reset}
  0x1234...abcd                     # address only
  0x1234...abcd,0xdead...beef       # address, private_key
`);
}

// ─── Chain filtering ───
function getActiveChains() {
  let chains = CHAINS;
  if (!config.includeTestnets) chains = chains.filter(c => !c.testnet);
  if (config.chains) {
    chains = chains.filter(c => {
      const lower = c.name.toLowerCase();
      const aliases = (c.aliases || []).map(a => a.toLowerCase());
      return config.chains.some(f => lower.includes(f) || aliases.includes(f));
    });
  }
  return chains;
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
      if (/^0x[0-9a-fA-F]{40}$/.test(part)) address = part;
      if (/^0x[0-9a-fA-F]{64,66}$/.test(part)) {
        privateKey = part;
        try { address = new ethers.Wallet(part).address; } catch {}
      }
    }
    if (address) wallets.push({ address, privateKey });
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

// ─── Batch balance check (raw JSON-RPC) ───
async function batchGetBalances(chain, addresses) {
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

// ─── Scan all wallets across chains ───
async function scanAll(wallets, chains) {
  const addrs = wallets.map(w => w.address);
  const chainBalances = {};

  for (let i = 0; i < chains.length; i += config.concurrency) {
    const batch = chains.slice(i, i + config.concurrency);
    const results = await Promise.all(batch.map(async chain => {
      const balances = await batchGetBalances(chain, addrs);
      return { name: chain.name, symbol: chain.symbol, chainId: chain.chainId, balances };
    }));
    for (const r of results) chainBalances[r.name] = r;
  }

  // Build per-address result: { address -> { chainName -> { symbol, balance, wei } } }
  const addrResults = {};
  for (let wi = 0; wi < wallets.length; wi++) {
    const addr = wallets[wi].address;
    addrResults[addr] = {};
    for (const chainName of Object.keys(chainBalances)) {
      const cr = chainBalances[chainName];
      const hex = cr.balances[wi] || '0x0';
      const wei = BigInt(hex);
      addrResults[addr][chainName] = {
        symbol: cr.symbol,
        balance: ethers.formatEther(wei),
        wei: wei.toString(),
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
      const prv = prevChains[chainName] || { wei: '0', balance: '0' };

      if (cur.wei !== prv.wei) {
        const curWei = BigInt(cur.wei);
        const prvWei = BigInt(prv.wei);
        const diff = curWei - prvWei;
        changes.push({
          address: addr,
          chain: chainName,
          symbol: cur.symbol,
          prevBalance: prv.balance,
          newBalance: cur.balance,
          prevWei: prv.wei,
          newWei: cur.wei,
          diffWei: diff.toString(),
          diffEther: ethers.formatEther(diff),
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
  const shortAddr = `${c.address.slice(0, 6)}...${c.address.slice(-4)}`;
  return `  ${color}${arrow}${C.reset} ${shortAddr} | ${c.chain} (${c.symbol}): ${c.prevBalance} -> ${C.bold}${color}${c.newBalance}${C.reset} (${c.diffEther > 0 ? '+' : ''}${c.diffEther})`;
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
        if (current[addr][ch].wei !== '0') {
          totalNonZero++;
          const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
          log(`  ${C.green}✓${C.reset} ${short} | ${ch} (${current[addr][ch].symbol}): ${C.bold}${current[addr][ch].balance}${C.reset}`);
        }
      }
    }
    if (totalNonZero === 0) {
      log(`  ${C.dim}All ${wallets.length} addresses have zero balance across ${chains.length} chains${C.reset}`);
    }
    log(`\n  ${C.dim}Baseline saved to: ${config.stateFile}${C.reset}`);
    log(`  ${C.dim}Addresses: ${wallets.length} | Chains: ${chains.length} | Total checks: ${wallets.length * chains.length}${C.reset}`);
    return;
  }

  // Compare with previous state
  const changes = diffState(prevState, current);

  if (changes.length === 0) {
    log(`  ${C.dim}No balance changes detected.${C.reset}`);
    return;
  }

  // Print changes
  log(`\n  ${C.bgYellow}${C.bold} BALANCE CHANGES DETECTED: ${changes.length} ${C.reset}\n`);
  for (const c of changes) {
    log(formatChange(c));
  }

  // Save changelog
  const changeEntry = { timestamp: new Date().toISOString(), changes };
  appendChange(changeEntry);

  // Update state
  saveState(current);

  log(`\n  ${C.dim}State updated. Changelog: ${CHANGELOG}${C.reset}`);

  // Telegram notification
  if (config.notify) {
    let msg = `<b>🔔 Balance Change Alert</b>\n<i>${now}</i>\n\n`;
    for (const c of changes) {
      const arrow = c.direction === 'INCREASE' ? '⬆️' : '⬇️';
      const short = `${c.address.slice(0, 6)}...${c.address.slice(-4)}`;
      msg += `${arrow} <code>${short}</code> | ${c.chain} (${c.symbol})\n`;
      msg += `   ${c.prevBalance} → <b>${c.newBalance}</b> (${c.diffEther > 0 ? '+' : ''}${c.diffEther})\n\n`;
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
  const chains = getActiveChains();
  const wallets = loadAddresses(config.inputFile);

  if (wallets.length === 0) {
    log(`${C.red}No valid addresses found in ${config.inputFile}${C.reset}`);
    process.exit(1);
  }

  log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║        Web3 Wallet Balance Monitor                  ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  log(`  ${C.dim}Time:${C.reset}         ${ts()}`);
  log(`  ${C.dim}Addresses:${C.reset}    ${C.white}${wallets.length}${C.reset}`);
  log(`  ${C.dim}Chains:${C.reset}       ${C.white}${chains.length}${C.reset}`);
  log(`  ${C.dim}Interval:${C.reset}     ${C.white}${config.interval > 0 ? config.interval + 's' : 'one-shot'}${C.reset}`);
  log(`  ${C.dim}State file:${C.reset}   ${C.white}${config.stateFile}${C.reset}`);
  log(`  ${C.dim}Notify:${C.reset}       ${C.white}${config.notify ? 'Telegram ON' : 'OFF'}${C.reset}`);
  log(`${'─'.repeat(60)}`);

  if (config.interval > 0) {
    log(`${C.dim}Running in continuous mode (Ctrl+C to stop)${C.reset}\n`);
    while (true) {
      await runCycle(wallets, chains);
      log(`\n  ${C.dim}Next scan in ${config.interval}s...${C.reset}\n`);
      await new Promise(r => setTimeout(r, config.interval * 1000));
    }
  } else {
    await runCycle(wallets, chains);
  }
}

main().catch(err => {
  log(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
