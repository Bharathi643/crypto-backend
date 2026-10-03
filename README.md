# Crypto Backend - Metadata Fix

Node.js + Express + PostgreSQL + Binance REST/WebSocket + CoinGecko.

Important fixes:
- `/api/coins` writes fresh Binance REST market data to PostgreSQL and then reads from PostgreSQL before responding.
- CoinGecko metadata is retried and synced in the background; failed metadata is marked `pending`, so it can be retried later instead of being permanently cached as unavailable.
- A bulk CoinGecko `/coins/markets` request seeds name/image/market/supply for all configured coins in one call.
- Coin details fetch full CoinGecko metadata on demand and store it in PostgreSQL.
- WebSocket pushes live Binance ticker updates directly to Flutter and snapshots latest values to PostgreSQL every few seconds.

Run:

npm install
npm start
