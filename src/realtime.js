import WebSocket, { WebSocketServer } from 'ws';
import { ASSETS, BINANCE_WS_BASE, SNAPSHOT_INTERVAL_SECONDS } from './config.js';
import { upsertLatest } from './db.js';

let upstream = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const latestBySymbol = new Map();

export function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (client) => {
    client.send(JSON.stringify({
      type: 'connection',
      status: upstream?.readyState === WebSocket.OPEN ? 'connected' : 'connecting',
      symbols: ASSETS.map((a) => a.symbol),
    }));
    latestBySymbol.forEach((value) => safeSend(client, value));
    connectUpstream(wss);
  });

  connectUpstream(wss);

  setInterval(async () => {
    const writes = [...latestBySymbol.values()].map((item) => upsertLatest(item).catch((error) => {
      console.error('PostgreSQL latest snapshot error:', error.message);
    }));
    await Promise.all(writes);
  }, Math.max(5, SNAPSHOT_INTERVAL_SECONDS) * 1000);

  return wss;
}

function connectUpstream(wss) {
  if (upstream && [WebSocket.OPEN, WebSocket.CONNECTING].includes(upstream.readyState)) return;

  const streams = ASSETS.map((a) => `${a.symbol.toLowerCase()}@ticker`).join('/');
  const url = `${BINANCE_WS_BASE}?streams=${streams}`;
  console.log('Connecting Binance WebSocket:', url);
  upstream = new WebSocket(url);

  upstream.on('open', () => {
    reconnectDelay = 1000;
    broadcast(wss, { type: 'source_status', source: 'binance', status: 'connected' });
  });

  upstream.on('message', (raw) => {
    try {
      const wrapper = JSON.parse(raw.toString());
      const data = wrapper.data || wrapper;
      if (data.e !== '24hrTicker') return;

      const item = {
        type: 'ticker',
        symbol: data.s,
        price: Number(data.c),
        priceChange24h: Number(data.p),
        priceChangePercent24h: Number(data.P),
        high24h: Number(data.h),
        low24h: Number(data.l),
        volume: Number(data.v),
        quoteVolume: Number(data.q),
        eventTime: Number(data.E),
      };
      latestBySymbol.set(item.symbol, item);
      broadcast(wss, item);
    } catch (error) {
      console.error('Binance WS message parse error:', error.message);
    }
  });

  upstream.on('close', () => {
    broadcast(wss, { type: 'source_status', source: 'binance', status: 'disconnected' });
    scheduleReconnect(wss);
  });

  upstream.on('error', (error) => {
    console.error('Binance WS error:', error.message);
  });
}

function scheduleReconnect(wss) {
  if (reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream(wss);
  }, delay);
}

function broadcast(wss, message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function safeSend(client, message) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
}
