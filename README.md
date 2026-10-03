# Crypto Backend

Node.js + Express + PostgreSQL + Binance REST/WebSocket + CoinGecko.

## Features

- Binance REST market data
- Binance historical candle data
- Binance WebSocket live ticker updates
- CoinGecko coin metadata
- PostgreSQL persistence
- Watchlist persistence
- REST API endpoints
- Live WebSocket gateway

## Important flow

- `/api/coins` writes fresh Binance REST market data to PostgreSQL and then reads from PostgreSQL before responding.
- CoinGecko metadata is synced in the background and retried when required.
- Bulk CoinGecko market data seeds metadata for configured coins.
- Coin details fetch detailed CoinGecko metadata and store it in PostgreSQL.
- Binance WebSocket pushes live Binance ticker updates directly to Flutter and stores latest snapshots in PostgreSQL.

## Run

```bash
npm install
npm start
```
