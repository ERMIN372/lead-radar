// HTTP API Поиска по организациям (https://yandex.ru/maps-api/docs/geosearch-api/).
// CORS открыт (access-control-allow-origin: *), поэтому ходим напрямую из браузера.

import { YANDEX } from '../config.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fmt = (n) => Number(n).toFixed(6);

// Тело ошибки по доке JSON, но без ключа реально приходит XML. Разбираем оба.
async function readError(res) {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body);
    if (j && j.message) return j.message;
  } catch { /* не JSON */ }
  const m = body.match(/<message>([^<]*)<\/message>/i);
  return m ? m[1] : body.slice(0, 200) || res.statusText;
}

export function humanError(err) {
  if (err.name === 'AbortError') return 'Запрос отменён.';
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400: return `Яндекс не принял запрос (400): ${err.message}`;
      case 403: return `Ключ поиска не принят (403, ответ Яндекса: «${err.message}»). Варианты: в поле поиска вставлен ключ карты, ключ с опечаткой, тариф для ключа не подключён или ещё не активирован, пробный период закончился.`;
      case 429: return 'Слишком много запросов за короткое время (429). Подожди минуту.';
      default: return `Ошибка API ${err.status}: ${err.message}`;
    }
  }
  return 'Нет ответа от Яндекса. Проверь интернет и отключи блокировщик рекламы для этого сайта. Подробности во вкладке Network в DevTools.';
}

export function buildUrl({ apikey, text, ll, spn, skip, results }) {
  const u = new URL(YANDEX.endpoint);
  u.searchParams.set('apikey', apikey);
  u.searchParams.set('text', text);
  u.searchParams.set('lang', YANDEX.lang);
  u.searchParams.set('type', 'biz');
  u.searchParams.set('ll', `${fmt(ll[0])},${fmt(ll[1])}`);
  u.searchParams.set('spn', `${fmt(spn[0])},${fmt(spn[1])}`);
  u.searchParams.set('rspn', '1');
  u.searchParams.set('results', String(results));
  if (skip > 0) u.searchParams.set('skip', String(skip));
  return u;
}

function normalize(feature) {
  const p = feature.properties || {};
  const c = p.CompanyMetaData || {};
  const id = String(c.id || p.uri || '');
  return {
    uid: 'y:' + id,
    source: 'yandex',
    id,
    name: c.name || p.name || '',
    address: c.address || (c.Address && c.Address.formatted) || p.description || '',
    category: (c.Categories || []).map((x) => x.name).filter(Boolean).join(', '),
    phones: (c.Phones || []).map((x) => x.formatted).filter(Boolean),
    url: c.url || '',
    hours: (c.Hours && c.Hours.text) || '',
    coords: feature.geometry && feature.geometry.coordinates,
    cardUrl: id ? YANDEX.cardUrl(id) : null,
    cardLabel: 'Яндекс Карты',
  };
}

export async function search(params, signal) {
  const url = buildUrl(params);
  let res;
  try {
    res = await fetch(url, { signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('network');
  }
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const json = await res.json();
  const meta = json?.properties?.ResponseMetaData?.SearchResponse || {};
  const features = Array.isArray(json.features) ? json.features : [];
  return {
    items: features.filter((f) => f?.properties?.CompanyMetaData).map(normalize),
    rawCount: features.length,
    found: Number(meta.found) || 0,
  };
}
