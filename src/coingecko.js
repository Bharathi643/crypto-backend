import {
  COINGECKO_API_KEY,
  COINGECKO_BASE,
  COINGECKO_KEY_HEADER,
  METADATA_RETRY_MAX,
} from './config.js';

function headers() {
  const h = { accept: 'application/json' };
  if (COINGECKO_API_KEY) h[COINGECKO_KEY_HEADER] = COINGECKO_API_KEY;
  return h;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, attempt = 0) {
  const response = await fetch(`${COINGECKO_BASE}${path}`, { headers: headers() });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (response.ok) return body;

  if ((response.status === 429 || response.status >= 500) && attempt < METADATA_RETRY_MAX) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30000, 1500 * 2 ** attempt);
    await sleep(delay);
    return request(path, attempt + 1);
  }

  const detail = body?.error || body?.status?.error_message || text || 'Unknown CoinGecko error';
  throw new Error(`CoinGecko ${response.status}: ${detail}`);
}

export async function getCoinMetadata(coingeckoId) {
  const data = await request(
    `/coins/${encodeURIComponent(coingeckoId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
  );

  return {
    name: data.name || coingeckoId,
    imageUrl: data.image?.large || data.image?.small || data.image?.thumb || null,
    description: stripHtml(data.description?.en || '') || null,
    websiteUrl: firstValid(data.links?.homepage) || null,
    marketCap: data.market_data?.market_cap?.usd ?? null,
    circulatingSupply: data.market_data?.circulating_supply ?? null,
    totalSupply: data.market_data?.total_supply ?? null,
    maxSupply: data.market_data?.max_supply ?? null,
  };
}

// One request can populate name/image/market/supply for all configured coins.
export async function getCoinsMarketMetadata(ids) {
  if (!ids.length) return [];
  const query = new URLSearchParams({
    vs_currency: 'usd',
    ids: ids.join(','),
    per_page: String(Math.min(ids.length, 250)),
    page: '1',
    sparkline: 'false',
  });
  return request(`/coins/markets?${query.toString()}`);
}

export async function getGlobalMarket() {
  const data = await request('/global');
  const d = data.data || {};
  return {
    totalMarketCap: d.total_market_cap?.usd ?? 0,
    totalVolume: d.total_volume?.usd ?? 0,
    btcDominance: d.market_cap_percentage?.btc ?? 0,
    activeCoins: d.active_cryptocurrencies ?? 0,
    markets: d.markets ?? 0,
  };
}

function firstValid(values) {
  if (!Array.isArray(values)) return null;
  return values.map((value) => String(value || '').trim()).find(Boolean) || null;
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
