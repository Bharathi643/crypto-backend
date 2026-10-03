import 'dotenv/config';

export const PORT = Number(process.env.PORT || 5000);
export const HOST = process.env.HOST || '0.0.0.0';
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crypto_market';

export const BINANCE_REST_BASE = process.env.BINANCE_REST_BASE || 'https://data-api.binance.vision';
export const BINANCE_WS_BASE = process.env.BINANCE_WS_BASE || 'wss://stream.binance.com:9443/stream';

export const COINGECKO_BASE = process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3';
export const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
export const COINGECKO_KEY_HEADER = process.env.COINGECKO_KEY_HEADER || 'x-cg-pro-api-key';

// Keep CoinGecko detail requests gentle so a free/demo key is less likely to be throttled.
export const METADATA_REQUEST_DELAY_MS = Number(process.env.METADATA_REQUEST_DELAY_MS || 2200);
export const METADATA_RETRY_MAX = Number(process.env.METADATA_RETRY_MAX || 4);
export const METADATA_REFRESH_HOURS = Number(process.env.METADATA_REFRESH_HOURS || 24);
export const GLOBAL_REFRESH_MINUTES = Number(process.env.GLOBAL_REFRESH_MINUTES || 5);
export const SNAPSHOT_INTERVAL_SECONDS = Number(process.env.SNAPSHOT_INTERVAL_SECONDS || 15);

// Binance Spot symbols + CoinGecko IDs.
export const ASSETS = [
  { symbol: 'BTCUSDT', coingeckoId: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', coingeckoId: 'ethereum', name: 'Ethereum' },
  { symbol: 'BNBUSDT', coingeckoId: 'binancecoin', name: 'BNB' },
  { symbol: 'SOLUSDT', coingeckoId: 'solana', name: 'Solana' },
  { symbol: 'XRPUSDT', coingeckoId: 'ripple', name: 'XRP' },
  { symbol: 'ADAUSDT', coingeckoId: 'cardano', name: 'Cardano' },
  { symbol: 'DOGEUSDT', coingeckoId: 'dogecoin', name: 'Dogecoin' },
  { symbol: 'AVAXUSDT', coingeckoId: 'avalanche-2', name: 'Avalanche' },
  { symbol: 'LINKUSDT', coingeckoId: 'chainlink', name: 'Chainlink' },
  { symbol: 'TRXUSDT', coingeckoId: 'tron', name: 'TRON' },
  { symbol: 'DOTUSDT', coingeckoId: 'polkadot', name: 'Polkadot' },
  { symbol: 'LTCUSDT', coingeckoId: 'litecoin', name: 'Litecoin' },
  { symbol: 'SHIBUSDT', coingeckoId: 'shiba-inu', name: 'Shiba Inu' },
  { symbol: 'UNIUSDT', coingeckoId: 'uniswap', name: 'Uniswap' },
  { symbol: 'AAVEUSDT', coingeckoId: 'aave', name: 'Aave' },
  { symbol: 'ATOMUSDT', coingeckoId: 'cosmos', name: 'Cosmos' },
  { symbol: 'NEARUSDT', coingeckoId: 'near', name: 'NEAR Protocol' },
  { symbol: 'FILUSDT', coingeckoId: 'filecoin', name: 'Filecoin' },
  { symbol: 'APTUSDT', coingeckoId: 'aptos', name: 'Aptos' },
  { symbol: 'SUIUSDT', coingeckoId: 'sui', name: 'Sui' },
];

export const ASSET_BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));
export const SYMBOL_LIST = ASSETS.map((a) => a.symbol);
