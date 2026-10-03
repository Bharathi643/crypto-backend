-- Run inside crypto_market if you want to inspect what is stored.
SELECT symbol, name, metadata_status, metadata_updated_at FROM coins ORDER BY symbol;
SELECT symbol, price, price_change_percent_24h, updated_at FROM market_latest ORDER BY symbol;
SELECT symbol, interval, COUNT(*) AS candle_count FROM candles GROUP BY symbol, interval ORDER BY symbol, interval;
SELECT * FROM market_global;
SELECT * FROM watchlist ORDER BY created_at DESC;
