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