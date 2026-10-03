import http from 'node:http';
import express from 'express';
import cors from 'cors';
import {
  initDb,
  seedAssetRows,
  getCoinsFromDb,
  getCoinFromDb,
  upsertCoinMetadata,
  upsertMarketMetadata,
  upsertLatest,
  insertCandles,
  getCandles,
  saveGlobalMarket,
  getGlobalMarketFromDb,
  addWatchlist,
  removeWatchlist,
  getWatchlist,
} from './db.js';
import {
  ASSETS,
  ASSET_BY_SYMBOL,
  SYMBOL_LIST,
  HOST,
  PORT,
  METADATA_REQUEST_DELAY_MS,
  METADATA_REFRESH_HOURS,
  GLOBAL_REFRESH_MINUTES,
} from './config.js';
import { getCoinMetadata, getCoinsMarketMetadata, getGlobalMarket } from './coingecko.js';
import { get24hTickers, get24hTicker, getKlines, ping } from './binance.js';
import { attachRealtime } from './realtime.js';

const app = express();
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get('/api/health', async (_req, res) => {
  try {
    await ping();
    res.json({ ok: true, service: 'crypto-market-backend', binance: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get('/api/coins', async (_req, res) => {
  try {
    // 1) Fetch fresh REST market data from Binance.
    const tickerRows = await get24hTickers(SYMBOL_LIST);
    for (const ticker of tickerRows) {
      await upsertLatest(normalizeTicker(ticker));
    }

    // 2) Read the response from PostgreSQL. Flutter receives DB-backed data.
    const refreshed = await getCoinsFromDb();
    const data = refreshed.map((row, index) => ({
      ...serializeCoin(row),
      rank: index + 1,
      live: Boolean(row.price != null),
    }));

    res.json({
      data,
      meta: {
        count: data.length,
        source: 'postgresql',
        marketSource: 'binance-spot-rest',
        metadataSource: 'coingecko',
      },
    });
  } catch (error) {
    console.error('GET /api/coins:', error);
    res.status(502).json({ error: 'Unable to load cryptocurrency data', details: error.message });
  }
});

app.get('/api/market', async (_req, res) => {
  try {
    const cached = await getGlobalMarketFromDb();
    const cacheFresh = cached?.updatedAt &&
      Date.now() - new Date(cached.updatedAt).getTime() < GLOBAL_REFRESH_MINUTES * 60 * 1000;

    if (!cacheFresh) {
      try {
        const global = await getGlobalMarket();
        await saveGlobalMarket(global);
      } catch (error) {
        console.warn('CoinGecko global stats unavailable:', error.message);
      }
    }

    const global = (await getGlobalMarketFromDb()) || {
      totalMarketCap: 0, totalVolume: 0, btcDominance: 0, activeCoins: 0, markets: 0,
    };

    // Market movers are refreshed through Binance REST and then read back from PostgreSQL.
    const tickers = await get24hTickers(SYMBOL_LIST);
    for (const t of tickers) await upsertLatest(normalizeTicker(t));
    const rows = await getCoinsFromDb();

    const movers = rows
      .filter((r) => r.price != null)
      .map((r) => ({ symbol: r.symbol, price: Number(r.price), priceChangePercent24h: Number(r.price_change_percent_24h || 0) }));

    res.json({
      data: {
        ...global,
        topGainers: [...movers].sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h).slice(0, 5),
        topLosers: [...movers].sort((a, b) => a.priceChangePercent24h - b.priceChangePercent24h).slice(0, 5),
      },
      meta: { source: 'postgresql', globalSource: 'coingecko', marketSource: 'binance-spot-rest' },
    });
  } catch (error) {
    res.status(502).json({ error: 'Unable to load market statistics', details: error.message });
  }
});

app.get('/api/coins/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const asset = ASSET_BY_SYMBOL.get(symbol);
  if (!asset) return res.status(404).json({ error: 'Unsupported symbol' });

  try {
    // CoinGecko detail + Binance REST are fetched, stored, then response is read from DB.
    let metadataError = null;
    try {
      const metadata = await getCoinMetadata(asset.coingeckoId);
      await upsertCoinMetadata(asset, metadata, 'ready', null);
    } catch (error) {
      metadataError = error.message;
      console.warn(`CoinGecko detail unavailable for ${symbol}: ${error.message}`);
    }

    try {
      const ticker = normalizeTicker(await get24hTicker(symbol));
      await upsertLatest(ticker);
    } catch (error) {
      console.warn(`Binance ticker unavailable for ${symbol}: ${error.message}`);
    }

    const row = await getCoinFromDb(symbol);
    if (!row) return res.status(404).json({ error: 'Coin not found in database' });

    res.json({
      data: serializeCoin(row),
      meta: {
        source: 'postgresql',
        metadataSource: row.metadata_status === 'ready' ? 'coingecko' : 'postgresql-cache',
        metadataError,
      },
    });
  } catch (error) {
    res.status(502).json({ error: 'Unable to load coin details', details: error.message });
  }
});

app.get('/api/coins/:symbol/history', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const asset = ASSET_BY_SYMBOL.get(symbol);
  if (!asset) return res.status(404).json({ error: 'Unsupported symbol' });

  const interval = String(req.query.interval || '1h');
  const allowed = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
  if (!allowed.has(interval)) return res.status(400).json({ error: 'Invalid interval' });
  const limit = Math.min(Math.max(Number(req.query.limit || 168), 2), 1000);

  try {
    try {
      const candles = await getKlines(symbol, interval, limit);
      await insertCandles(symbol, interval, candles);
    } catch (error) {
      console.warn(`Binance history unavailable for ${symbol}: ${error.message}`);
    }

    const stored = await getCandles(symbol, interval, limit);
    if (!stored.length) return res.status(502).json({ error: 'No historical data available' });

    res.json({ data: stored, meta: { source: 'postgresql', upstream: 'binance-spot-rest' } });
  } catch (error) {
    res.status(502).json({ error: 'Unable to load historical data', details: error.message });
  }
});

app.get('/api/watchlist', async (req, res) => {
  const deviceId = String(req.query.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  try { res.json({ data: await getWatchlist(deviceId) }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/watchlist', async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').trim();
  const symbol = String(req.body?.symbol || '').toUpperCase();
  if (!deviceId || !ASSET_BY_SYMBOL.has(symbol)) return res.status(400).json({ error: 'Valid deviceId and symbol are required' });
  try { await addWatchlist(deviceId, symbol); res.status(201).json({ ok: true, symbol }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/watchlist/:symbol', async (req, res) => {
  const deviceId = String(req.query.deviceId || '').trim();
  const symbol = req.params.symbol.toUpperCase();
  if (!deviceId || !ASSET_BY_SYMBOL.has(symbol)) return res.status(400).json({ error: 'Valid deviceId and symbol are required' });
  try { await removeWatchlist(deviceId, symbol); res.json({ ok: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

function normalizeTicker(t) {
  return {
    symbol: String(t.symbol).toUpperCase(),
    price: Number(t.lastPrice),
    priceChange24h: Number(t.priceChange),
    priceChangePercent24h: Number(t.priceChangePercent),
    high24h: Number(t.highPrice),
    low24h: Number(t.lowPrice),
    volume: Number(t.volume),
    quoteVolume: Number(t.quoteVolume),
    eventTime: Number(t.closeTime || Date.now()),
  };
}

function serializeCoin(row) {
  return {
    symbol: row.symbol,
    coingeckoId: row.coingecko_id,
    name: row.name,
    imageUrl: row.image_url,
    description: row.description,
    websiteUrl: row.website_url,
    metadataStatus: row.metadata_status,
    marketCap: Number(row.market_cap || 0),
    circulatingSupply: Number(row.circulating_supply || 0),
    totalSupply: row.total_supply == null ? null : Number(row.total_supply),
    maxSupply: row.max_supply == null ? null : Number(row.max_supply),
    price: Number(row.price || 0),
    priceChange24h: Number(row.price_change_24h || 0),
    priceChangePercent24h: Number(row.price_change_percent_24h || 0),
    high24h: Number(row.high_24h || 0),
    low24h: Number(row.low_24h || 0),
    volume: Number(row.volume || 0),
    quoteVolume: Number(row.quote_volume || 0),
    eventTime: Number(row.event_time || 0),
    marketUpdatedAt: row.market_updated_at,
  };
}

async function syncBulkMarketMetadata() {
  try {
    const items = await getCoinsMarketMetadata(ASSETS.map((a) => a.coingeckoId));
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const asset of ASSETS) {
      const market = byId.get(asset.coingeckoId);
      if (market) await upsertMarketMetadata(asset, market);
    }
    console.log(`CoinGecko bulk metadata synced: ${items.length} coins`);
  } catch (error) {
    console.warn(`CoinGecko bulk metadata sync unavailable: ${error.message}`);
  }
}

async function syncDetailedMetadataOnce() {
  const rows = await getCoinsFromDb();
  const cutoff = Date.now() - METADATA_REFRESH_HOURS * 60 * 60 * 1000;
  const pending = rows.filter((row) =>
    row.metadata_status !== 'ready' ||
    !row.description ||
    !row.metadata_updated_at ||
    new Date(row.metadata_updated_at).getTime() < cutoff,
  );

  for (const row of pending) {
    const asset = ASSET_BY_SYMBOL.get(row.symbol);
    if (!asset) continue;
    try {
      const metadata = await getCoinMetadata(asset.coingeckoId);
      await upsertCoinMetadata(asset, metadata, 'ready', null);
      console.log(`CoinGecko detail synced: ${asset.symbol}`);
    } catch (error) {
      await upsertCoinMetadata(asset, {
        name: asset.name,
        imageUrl: row.image_url,
        description: row.description,
        websiteUrl: row.website_url,
        marketCap: row.market_cap,
        circulatingSupply: row.circulating_supply,
        totalSupply: row.total_supply,
        maxSupply: row.max_supply,
      }, 'pending', error.message);
      console.warn(`CoinGecko detail pending: ${asset.symbol} -> ${error.message}`);
    }
    await sleep(METADATA_REQUEST_DELAY_MS);
  }
}

const server = http.createServer(app);
attachRealtime(server);

await initDb();
await seedAssetRows(ASSETS);
server.listen(PORT, HOST, () => {
  console.log(`Crypto backend running at http://localhost:${PORT}`);
  console.log(`Network URL: http://192.168.31.109:${PORT}`);
  console.log(`WebSocket: ws://192.168.31.109:${PORT}/ws`);
});

// Metadata is intentionally background work so REST market data remains responsive.
void syncBulkMarketMetadata().then(() => syncDetailedMetadataOnce());
setInterval(() => void syncDetailedMetadataOnce(), Math.max(30, METADATA_REFRESH_HOURS * 60) * 60 * 1000);
