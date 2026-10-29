// OpenStreetMap через Overpass API. Бесплатно, без ключа, данные под ODbL:
// их можно хранить и сортировать, нужна только атрибуция.
// Минус: сайты и телефоны в OSM заполнены хуже, чем в Яндексе.

import { OSM } from '../config.js';

// Для своего запроса ищем по имени регуляркой. Спецсимволы выкидываем, чтобы
// не сломать Overpass QL и не получить регулярку, которая матчит всё подряд.
const safeText = (s) => String(s).replace(/[^\p{L}\p{N}\s-]/gu, '').trim();

export function buildQuery({ filters, text, ll, spn }) {
  const south = ll[1] - spn[1] / 2;
  const north = ll[1] + spn[1] / 2;
  const west = ll[0] - spn[0] / 2;
  const east = ll[0] + spn[0] / 2;
  const bbox = [south, west, north, east].map((n) => n.toFixed(5)).join(',');
  const branches = filters && filters.length
    ? filters
    : [`["name"~"${safeText(text)}",i]`];
  const body = branches.map((f) => `  nwr${f}(${bbox});`).join('\n');
  return `[out:json][timeout:${OSM.timeoutSec}];\n(\n${body}\n);\nout center tags ${OSM.maxResults};`;
}

function addr(t) {
  const street = t['addr:street'] || t['addr:place'] || '';
  const house = t['addr:housenumber'] || '';
  const city = t['addr:city'] || '';
  return [city, [street, house].filter(Boolean).join(', ')].filter(Boolean).join(', ');
}

const CATEGORY_RU = {
  cafe: 'Кафе', restaurant: 'Ресторан', florist: 'Цветы', hairdresser: 'Парикмахерская',
  beauty: 'Салон красоты', bakery: 'Пекарня', car_repair: 'Автосервис',
};

function normalize(el) {
  const t = el.tags || {};
  const lon = el.lon ?? el.center?.lon;
  const lat = el.lat ?? el.center?.lat;
  const kind = t.amenity || t.shop || t.craft || '';
  const social = t['contact:vk'] || t['contact:instagram'] || t['contact:telegram'] || t['contact:facebook'] || '';
  const phones = [t.phone, t['contact:phone'], t['contact:mobile']]
    .filter(Boolean)
    .flatMap((p) => p.split(';').map((x) => x.trim()))
    .filter(Boolean);
  return {
    uid: `o:${el.type}/${el.id}`,
    source: 'osm',
    id: `${el.type}/${el.id}`,
    name: t.name || t.brand || '(без названия)',
    address: addr(t),
    category: CATEGORY_RU[kind] || kind,
    phones: [...new Set(phones)],
    // Сайт берём из website, если нет, то из соцсетей: это и есть "соцсеть вместо сайта".
    url: t.website || t['contact:website'] || t.url || social,
    hours: t.opening_hours || '',
    coords: Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null,
    cardUrl: OSM.objectUrl(el.type, el.id),
    cardLabel: 'OpenStreetMap',
  };
}

export async function search(params, signal) {
  const query = buildQuery(params);
  let lastErr = null;
  for (const endpoint of OSM.endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      const json = await res.json();
      const items = (json.elements || []).map(normalize).filter((x) => x.coords);
      return { items, rawCount: items.length, found: items.length };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Overpass недоступен');
}

export function humanError(err) {
  if (err.name === 'AbortError') return 'Запрос отменён.';
  return `OpenStreetMap (Overpass) не ответил: ${err.message}. Публичные серверы бывают перегружены, попробуй через минуту или возьми область поменьше.`;
}
