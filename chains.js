// Multi-chain configurations
// type: 'evm' | 'solana' | 'sui' | 'cosmos'
// Free public RPC endpoints (no API key required)

const CHAINS = [
  // ═══════════════════════════════════════════
  //  EVM Chains
  // ═══════════════════════════════════════════

  // === Ethereum & L2 ===
  { type: 'evm', name: 'Ethereum',        chainId: 1,       symbol: 'ETH',  decimals: 18, rpc: 'https://eth.llamarpc.com' },
  { type: 'evm', name: 'Arbitrum One',    chainId: 42161,   aliases: ['arb', 'arbitrum'],   symbol: 'ETH',  decimals: 18, rpc: 'https://arb1.arbitrum.io/rpc' },
  { type: 'evm', name: 'Optimism',        chainId: 10,      aliases: ['op'],                symbol: 'ETH',  decimals: 18, rpc: 'https://mainnet.optimism.io' },
  { type: 'evm', name: 'Base',            chainId: 8453,    symbol: 'ETH',  decimals: 18, rpc: 'https://mainnet.base.org' },
  { type: 'evm', name: 'Linea',           chainId: 59144,   symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.linea.build' },
  { type: 'evm', name: 'zkSync Era',      chainId: 324,     aliases: ['zksync'],  symbol: 'ETH',  decimals: 18, rpc: 'https://mainnet.era.zksync.io' },
  { type: 'evm', name: 'Scroll',          chainId: 534352,  symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.scroll.io' },
  { type: 'evm', name: 'Blast',           chainId: 81457,   symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.blast.io' },
  { type: 'evm', name: 'Mantle',          chainId: 5000,    symbol: 'MNT',  decimals: 18, rpc: 'https://rpc.mantle.xyz' },
  { type: 'evm', name: 'Mode',            chainId: 34443,   symbol: 'ETH',  decimals: 18, rpc: 'https://mainnet.mode.network' },
  { type: 'evm', name: 'Zora',            chainId: 7777777, symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.zora.energy' },
  { type: 'evm', name: 'opBNB',           chainId: 204,     symbol: 'BNB',  decimals: 18, rpc: 'https://opbnb-mainnet-rpc.bnbchain.org' },

  // === Alternative L1 ===
  { type: 'evm', name: 'Polygon',         chainId: 137,     aliases: ['matic', 'pol'],  symbol: 'POL',  decimals: 18, rpc: 'https://polygon-rpc.com' },
  { type: 'evm', name: 'BNB Chain',       chainId: 56,      aliases: ['bsc', 'binance'],      symbol: 'BNB',  decimals: 18, rpc: 'https://bsc-dataseed1.binance.org' },
  { type: 'evm', name: 'Avalanche C-Chain',chainId: 43114,  aliases: ['avax'],  symbol: 'AVAX', decimals: 18, rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  { type: 'evm', name: 'Fantom',          chainId: 250,     aliases: ['ftm'],     symbol: 'FTM',  decimals: 18, rpc: 'https://rpc.ftm.tools' },
  { type: 'evm', name: 'Cronos',          chainId: 25,      symbol: 'CRO',  decimals: 18, rpc: 'https://evm.cronos.org' },
  { type: 'evm', name: 'Gnosis Chain',    chainId: 100,     aliases: ['xdai'],  symbol: 'xDAI', decimals: 18, rpc: 'https://rpc.gnosischain.com' },
  { type: 'evm', name: 'Celo',            chainId: 42220,   symbol: 'CELO', decimals: 18, rpc: 'https://forno.celo.org' },
  { type: 'evm', name: 'Moonbeam',        chainId: 1284,    symbol: 'GLMR', decimals: 18, rpc: 'https://rpc.api.moonbeam.network' },
  { type: 'evm', name: 'Moonriver',       chainId: 1285,    symbol: 'MOVR', decimals: 18, rpc: 'https://rpc.api.moonriver.moonbeam.network' },
  { type: 'evm', name: 'Aurora',          chainId: 1313161554, symbol:'ETH', decimals: 18, rpc: 'https://mainnet.aurora.dev' },
  { type: 'evm', name: 'Harmony',         chainId: 1666600000, symbol:'ONE', decimals: 18, rpc: 'https://api.harmony.one' },
  { type: 'evm', name: 'Klaytn',          chainId: 8217,    symbol: 'KLAY', decimals: 18, rpc: 'https://public-en-cypress.klaytn.net' },
  { type: 'evm', name: 'Meter',           chainId: 82,      symbol: 'MTR',  decimals: 18, rpc: 'https://rpc.meter.io' },
  { type: 'evm', name: 'Syscoin',         chainId: 57,      symbol: 'SYS',  decimals: 18, rpc: 'https://rpc.syscoin.org' },
  { type: 'evm', name: 'Telos',           chainId: 40,      symbol: 'TLOS', decimals: 18, rpc: 'https://mainnet.telos.net/evm' },
  { type: 'evm', name: 'WEMIX',           chainId: 1111,    symbol: 'WEMIX',decimals: 18, rpc: 'https://api.wemix.com' },
  { type: 'evm', name: 'EthereumPoW',     chainId: 10001,   symbol: 'ETHW', decimals: 18, rpc: 'https://mainnet.ethereumpow.org' },
  { type: 'evm', name: 'SmartBCH',        chainId: 10000,   symbol: 'BCH',  decimals: 18, rpc: 'https://smartbch.greyh.at' },

  // === Polygon Ecosystem ===
  { type: 'evm', name: 'Polygon zkEVM',   chainId: 1101,    symbol: 'ETH',  decimals: 18, rpc: 'https://zkevm-rpc.com' },

  // === Newer Chains ===
  { type: 'evm', name: 'Sei',             chainId: 1329,    symbol: 'SEI',  decimals: 18, rpc: 'https://evm-rpc.sei-apis.com' },
  { type: 'evm', name: 'Taiko',           chainId: 167000,  symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.mainnet.taiko.xyz' },
  { type: 'evm', name: 'Manta Pacific',   chainId: 169,     symbol: 'ETH',  decimals: 18, rpc: 'https://pacific-rpc.manta.network/http' },
  { type: 'evm', name: 'Gravity',         chainId: 1625,    symbol: 'G',    decimals: 18, rpc: 'https://rpc.gravity.xyz' },
  { type: 'evm', name: 'WorldChain',      chainId: 480,     symbol: 'ETH',  decimals: 18, rpc: 'https://worldchain-mainnet.g.alchemy.com/public' },
  { type: 'evm', name: 'Abstract',        chainId: 2741,    symbol: 'ETH',  decimals: 18, rpc: 'https://api.mainnet.abs.xyz' },
  { type: 'evm', name: 'Soneium',         chainId: 1868,    symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.soneium.org' },
  { type: 'evm', name: 'Ink',             chainId: 57073,   symbol: 'ETH',  decimals: 18, rpc: 'https://rpc-gel.inkonchain.com' },
  { type: 'evm', name: 'Unichain',        chainId: 130,     symbol: 'ETH',  decimals: 18, rpc: 'https://mainnet.unichain.org' },
  { type: 'evm', name: 'Corn',            chainId: 21000000,symbol: 'BTCN', decimals: 18, rpc: 'https://mainnet.corn-rpc.com' },

  // === Testnets (optional) ===
  { type: 'evm', name: 'Sepolia',         chainId: 11155111,symbol: 'ETH',  decimals: 18, rpc: 'https://rpc.sepolia.org', testnet: true },
  { type: 'evm', name: 'Holesky',         chainId: 17000,   symbol: 'ETH',  decimals: 18, rpc: 'https://ethereum-holesky-rpc.publicnode.com', testnet: true },

  // ═══════════════════════════════════════════
  //  Non-EVM Chains
  // ═══════════════════════════════════════════

  // === Solana ===
  {
    type: 'solana',
    name: 'Solana',
    aliases: ['sol'],
    symbol: 'SOL',
    decimals: 9,         // 1 SOL = 1e9 lamports
    unit: 'lamports',    // raw unit name
    rpc: 'https://api.mainnet-beta.solana.com',
  },

  // === Sui ===
  {
    type: 'sui',
    name: 'Sui',
    symbol: 'SUI',
    decimals: 9,         // 1 SUI = 1e9 MIST
    unit: 'MIST',
    rpc: 'https://fullnode.mainnet.sui.io',
  },

  // === Cosmos Ecosystem ===
  {
    type: 'cosmos',
    name: 'Cosmos Hub',
    aliases: ['atom', 'cosmos'],
    symbol: 'ATOM',
    decimals: 6,         // 1 ATOM = 1e6 uatom
    unit: 'uatom',
    rpc: 'https://lcd-cosmoshub.keplr.app',
    denom: 'uatom',
  },
  {
    type: 'cosmos',
    name: 'Osmosis',
    aliases: ['osmo'],
    symbol: 'OSMO',
    decimals: 6,
    unit: 'uosmo',
    rpc: 'https://lcd-osmosis.keplr.app',
    denom: 'uosmo',
  },
  {
    type: 'cosmos',
    name: 'Celestia',
    aliases: ['tia'],
    symbol: 'TIA',
    decimals: 6,
    unit: 'utia',
    rpc: 'https://lcd-celestia.keplr.app',
    denom: 'utia',
  },
  {
    type: 'cosmos',
    name: 'Injective',
    aliases: ['inj'],
    symbol: 'INJ',
    decimals: 18,
    unit: 'inj',
    rpc: 'https://lcd-injective.keplr.app',
    denom: 'inj',
  },
  {
    type: 'cosmos',
    name: 'dYdX',
    aliases: ['dydx'],
    symbol: 'DYDX',
    decimals: 18,
    unit: 'adydx',
    rpc: 'https://lcd-dydx.keplr.app',
    denom: 'adydx',
  },
];

module.exports = { CHAINS };
