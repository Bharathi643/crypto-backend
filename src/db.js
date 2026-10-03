import pg from 'pg';
import { DATABASE_URL } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS coins (
      symbol VARCHAR(20) PRIMARY KEY,
      coingecko_id VARCHAR(120) NOT NULL,
      name VARCHAR(160) NOT NULL,
      image_url TEXT,
      description TEXT,
      website_url TEXT,
      market_cap NUMERIC,
      circulating_supply NUMERIC,
      total_supply NUMERIC,
      max_supply NUMERIC,
      metadata_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      metadata_last_error TEXT,
      metadata_updated_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE coins ADD COLUMN IF NOT EXISTS metadata_status VARCHAR(20) NOT NULL DEFAULT 'pending';
    ALTER TABLE coins ADD COLUMN IF NOT EXISTS metadata_last_error TEXT;
    ALTER TABLE coins ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS market_latest (
      symbol VARCHAR(20) PRIMARY KEY REFERENCES coins(symbol) ON DELETE CASCADE,
      price NUMERIC NOT NULL,
      price_change_24h NUMERIC NOT NULL DEFAULT 0,
      price_change_percent_24h NUMERIC NOT NULL DEFAULT 0,
      high_24h NUMERIC,
      low_24h NUMERIC,
      volume NUMERIC,
      quote_volume NUMERIC,
      event_time BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS candles (
      symbol VARCHAR(20) NOT NULL REFERENCES coins(symbol) ON DELETE CASCADE,
      interval VARCHAR(10) NOT NULL,
      open_time BIGINT NOT NULL,
      open NUMERIC NOT NULL,
      high NUMERIC NOT NULL,
      low NUMERIC NOT NULL,
      close NUMERIC NOT NULL,
      volume NUMERIC NOT NULL,
      close_time BIGINT,
      trades INTEGER,
      PRIMARY KEY (symbol, interval, open_time)
    );

    CREATE INDEX IF NOT EXISTS idx_candles_symbol_interval_time
      ON candles(symbol, interval, open_time DESC);

    CREATE TABLE IF NOT EXISTS market_global (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      total_market_cap NUMERIC NOT NULL DEFAULT 0,
      total_volume NUMERIC NOT NULL DEFAULT 0,
      btc_dominance NUMERIC NOT NULL DEFAULT 0,
      active_coins INTEGER NOT NULL DEFAULT 0,
      markets INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      device_id VARCHAR(120) NOT NULL,
      symbol VARCHAR(20) NOT NULL REFERENCES coins(symbol) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, symbol)
    );
  `);
}

export async function seedAssetRows(assets) {
  for (const asset of assets) {
    await query(`
      INSERT INTO coins(symbol, coingecko_id, name, metadata_status)
      VALUES ($1,$2,$3,'pending')
      ON CONFLICT(symbol) DO UPDATE SET
        coingecko_id = EXCLUDED.coingecko_id,
        name = COALESCE(NULLIF(coins.name, ''), EXCLUDED.name)
    `, [asset.symbol, asset.coingeckoId, asset.name]);
  }
}

export async function getCoinsFromDb() {
  const { rows } = await query(`
    SELECT
      c.symbol, c.coingecko_id, c.name, c.image_url, c.description, c.website_url,
      c.market_cap, c.circulating_supply, c.total_supply, c.max_supply,
      c.metadata_status, c.metadata_last_error, c.metadata_updated_at,
      ml.price, ml.price_change_24h, ml.price_change_percent_24h,
      ml.high_24h, ml.low_24h, ml.volume, ml.quote_volume, ml.event_time,
      ml.updated_at AS market_updated_at
    FROM coins c
    LEFT JOIN market_latest ml ON ml.symbol = c.symbol
    ORDER BY COALESCE(c.market_cap,0) DESC, c.name ASC
  `);
  return rows;
}

export async function getCoinFromDb(symbol) {
  const { rows } = await query(`
    SELECT
      c.symbol, c.coingecko_id, c.name, c.image_url, c.description, c.website_url,
      c.market_cap, c.circulating_supply, c.total_supply, c.max_supply,
      c.metadata_status, c.metadata_last_error, c.metadata_updated_at,
      ml.price, ml.price_change_24h, ml.price_change_percent_24h,
      ml.high_24h, ml.low_24h, ml.volume, ml.quote_volume, ml.event_time,
      ml.updated_at AS market_updated_at
    FROM coins c
    LEFT JOIN market_latest ml ON ml.symbol = c.symbol
    WHERE c.symbol = $1
    LIMIT 1
  `, [symbol]);
  return rows[0] || null;
}

export async function upsertCoinMetadata(asset, metadata, status = 'ready', lastError = null) {
  await query(`
    INSERT INTO coins (
      symbol, coingecko_id, name, image_url, description, website_url,
      market_cap, circulating_supply, total_supply, max_supply,
      metadata_status, metadata_last_error, metadata_updated_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
    ON CONFLICT(symbol) DO UPDATE SET
      coingecko_id = EXCLUDED.coingecko_id,
      name = COALESCE(EXCLUDED.name, coins.name),
      image_url = COALESCE(EXCLUDED.image_url, coins.image_url),
      description = CASE
        WHEN EXCLUDED.metadata_status = 'ready' THEN EXCLUDED.description
        ELSE coins.description
      END,
      website_url = CASE
        WHEN EXCLUDED.metadata_status = 'ready' THEN EXCLUDED.website_url
        ELSE coins.website_url
      END,
      market_cap = COALESCE(EXCLUDED.market_cap, coins.market_cap),
      circulating_supply = COALESCE(EXCLUDED.circulating_supply, coins.circulating_supply),
      total_supply = COALESCE(EXCLUDED.total_supply, coins.total_supply),
      max_supply = COALESCE(EXCLUDED.max_supply, coins.max_supply),
      metadata_status = EXCLUDED.metadata_status,
      metadata_last_error = EXCLUDED.metadata_last_error,
      metadata_updated_at = CASE WHEN EXCLUDED.metadata_status = 'ready' THEN NOW() ELSE coins.metadata_updated_at END,
      updated_at = NOW()
  `, [
    asset.symbol,
    asset.coingeckoId,
    metadata.name || asset.name,
    metadata.imageUrl ?? null,
    metadata.description ?? null,
    metadata.websiteUrl ?? null,
    metadata.marketCap ?? null,
    metadata.circulatingSupply ?? null,
    metadata.totalSupply ?? null,
    metadata.maxSupply ?? null,
    status,
    lastError,
  ]);
}

export async function upsertMarketMetadata(asset, market) {
  await query(`
    UPDATE coins SET
      name = COALESCE(NULLIF($2,''), name),
      image_url = COALESCE($3, image_url),
      market_cap = COALESCE($4, market_cap),
      circulating_supply = COALESCE($5, circulating_supply),
      total_supply = COALESCE($6, total_supply),
      max_supply = COALESCE($7, max_supply),
      updated_at = NOW()
    WHERE symbol = $1
  `, [
    asset.symbol,
    market.name || asset.name,
    market.image || null,
    market.market_cap ?? null,
    market.circulating_supply ?? null,
    market.total_supply ?? null,
    market.max_supply ?? null,
  ]);
}

export async function upsertLatest(item) {
  await query(`
    INSERT INTO market_latest (
      symbol, price, price_change_24h, price_change_percent_24h,
      high_24h, low_24h, volume, quote_volume, event_time, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT(symbol) DO UPDATE SET
      price = EXCLUDED.price,
      price_change_24h = EXCLUDED.price_change_24h,
      price_change_percent_24h = EXCLUDED.price_change_percent_24h,
      high_24h = EXCLUDED.high_24h,
      low_24h = EXCLUDED.low_24h,
      volume = EXCLUDED.volume,
      quote_volume = EXCLUDED.quote_volume,
      event_time = EXCLUDED.event_time,
      updated_at = NOW()
  `, [
    item.symbol, item.price, item.priceChange24h, item.priceChangePercent24h,
    item.high24h, item.low24h, item.volume, item.quoteVolume, item.eventTime,
  ]);
}

export async function insertCandles(symbol, interval, candles) {
  if (!candles.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const candle of candles) {
      await client.query(`
        INSERT INTO candles (
          symbol, interval, open_time, open, high, low, close, volume, close_time, trades
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(symbol, interval, open_time) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          close_time = EXCLUDED.close_time,
          trades = EXCLUDED.trades
      `, [symbol, interval, candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime, candle.trades]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCandles(symbol, interval, limit) {
  const { rows } = await query(`
    SELECT open_time, open, high, low, close, volume, close_time, trades
    FROM candles
    WHERE symbol = $1 AND interval = $2
    ORDER BY open_time DESC
    LIMIT $3
  `, [symbol, interval, limit]);
  return rows.reverse();
}

export async function saveGlobalMarket(data) {
  await query(`
    INSERT INTO market_global(id, total_market_cap, total_volume, btc_dominance, active_coins, markets, updated_at)
    VALUES(1,$1,$2,$3,$4,$5,NOW())
    ON CONFLICT(id) DO UPDATE SET
      total_market_cap = EXCLUDED.total_market_cap,
      total_volume = EXCLUDED.total_volume,
      btc_dominance = EXCLUDED.btc_dominance,
      active_coins = EXCLUDED.active_coins,
      markets = EXCLUDED.markets,
      updated_at = NOW()
  `, [data.totalMarketCap, data.totalVolume, data.btcDominance, data.activeCoins, data.markets]);
}

export async function getGlobalMarketFromDb() {
  const { rows } = await query(`
    SELECT total_market_cap, total_volume, btc_dominance, active_coins, markets, updated_at
    FROM market_global WHERE id = 1 LIMIT 1
  `);
  if (!rows[0]) return null;
  return {
    totalMarketCap: Number(rows[0].total_market_cap || 0),
    totalVolume: Number(rows[0].total_volume || 0),
    btcDominance: Number(rows[0].btc_dominance || 0),
    activeCoins: Number(rows[0].active_coins || 0),
    markets: Number(rows[0].markets || 0),
    updatedAt: rows[0].updated_at,
  };
}

export async function addWatchlist(deviceId, symbol) {
  await query(`INSERT INTO watchlist(device_id, symbol) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [deviceId, symbol]);
}

export async function removeWatchlist(deviceId, symbol) {
  await query(`DELETE FROM watchlist WHERE device_id = $1 AND symbol = $2`, [deviceId, symbol]);
}

export async function getWatchlist(deviceId) {
  const { rows } = await query(`SELECT symbol FROM watchlist WHERE device_id = $1 ORDER BY created_at DESC`, [deviceId]);
  return rows.map((r) => r.symbol);
}
