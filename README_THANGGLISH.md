# Why some coins showed "Metadata temporarily unavailable"

The earlier backend wrote a fallback row when a CoinGecko detail request failed, then treated that row as fresh for 12 hours. That meant a temporary CoinGecko failure could make the same coin keep showing the fallback message.

This version fixes it:

1. All configured assets are seeded as `pending`.
2. One CoinGecko `/coins/markets` call fills common fields (name, image, market cap, supply) for all configured coins.
3. Detailed description/official website are synced one coin at a time in a rate-limited background job.
4. Failed detail requests remain `pending` with the error recorded, so they are retried later.
5. Opening a coin detail calls the backend, which tries CoinGecko immediately and then returns the database row.
6. Flutter shows the full CoinGecko description/website when available.

## Website button

Android 11+ package visibility can make `canLaunchUrl()` return false unless `<queries>` is configured. The new Flutter code calls `launchUrl()` directly and shows a SnackBar when launching fails.

## Check PostgreSQL

In psql:

\c crypto_market
\dt
SELECT symbol, name, metadata_status FROM coins ORDER BY symbol;
SELECT symbol, price, updated_at FROM market_latest ORDER BY symbol;
