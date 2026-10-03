import { BINANCE_REST_BASE } from './config.js';

async function request(path, params = {}) {
  const url = new URL(`/api/v3${path}`, BINANCE_REST_BASE);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) {
    throw new Error(`Binance ${response.status}: ${body?.msg || text}`);
  }
  return body;
}

export async function get24hTickers(symbols) {
  return request('/ticker/24hr', { symbols: JSON.stringify(symbols) });
}

export async function get24hTicker(symbol) {
  return request('/ticker/24hr', { symbol });
}

export async function getKlines(symbol, interval, limit = 168) {
  const safeLimit = Math.min(Math.max(Number(limit) || 168, 1), 1000);
  const rows = await request('/klines', { symbol, interval, limit: safeLimit });
  return rows.map((r) => ({
    openTime: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    closeTime: Number(r[6]),
    trades: Number(r[8]),
  }));
}

export async function ping() {
  await request('/ping');
  return true;
}
