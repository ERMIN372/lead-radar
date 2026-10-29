// Синтетическая выдача в формате из документации (поля только задокументированные).
// Это НЕ реальные данные Яндекса: названия и телефоны выдуманы для тестов.

export const URL_CYCLE = [
  '',                              // none
  'vk.com/club1',                  // social
  'https://instagram.com/test',    // social
  'http://www.cafe-test.ru/',      // site
  'n123.yclients.com/company/1',   // social (онлайн-запись)
  'taplink.cc/abc',                // social
  'https://cafe.tilda.ws',         // site + подсказка "конструктор"
  'site-without-scheme.ru',        // site
  '   ',                           // none
  'https://t.me/testcafe',         // social
];

export function feature(i) {
  const name = i === 3 ? '<img src=x onerror="window.__xss=1">Кафе XSS' : `Тестовое кафе ${i + 1}`;
  return {
    type: 'Feature',
    properties: {
      name,
      description: `Москва, Тестовая улица, ${i + 1}`,
      CompanyMetaData: {
        id: String(1000000 + i),
        name,
        address: `Москва, Тестовая улица, ${i + 1}`,
        url: URL_CYCLE[i % URL_CYCLE.length],
        Categories: [{ class: 'cafe', name: 'Кафе' }],
        Phones: i % 4 === 0 ? [] : [{ type: 'phone', formatted: `+7 (495) 000-${String(i).padStart(2, '0')}-00` }],
        Hours: { text: 'ежедневно, 10:00–22:00', Availabilities: [{ Everyday: true, Intervals: [{ from: '10:00:00', to: '22:00:00' }] }] },
      },
    },
    geometry: { type: 'Point', coordinates: [37.55 + (i % 10) * 0.012, 55.72 + Math.floor(i / 10) * 0.01] },
  };
}

export function page({ skip, results, found }) {
  const n = Math.max(0, Math.min(results, found - skip));
  return {
    type: 'FeatureCollection',
    properties: {
      ResponseMetaData: {
        SearchRequest: { request: 'кафе', results, skip },
        SearchResponse: { found, display: 'multiple' },
      },
    },
    features: Array.from({ length: n }, (_, k) => feature(skip + k)),
  };
}

export const overpass = {
  elements: [
    { type: 'node', id: 1, lat: 55.75, lon: 37.61, tags: { amenity: 'cafe', name: 'Яблоко OSM', website: 'https://apple-cafe.ru', phone: '+7 495 111-11-11' } },
    { type: 'way', id: 2, center: { lat: 55.751, lon: 37.62 }, tags: { amenity: 'cafe', name: 'Арбуз OSM', 'contact:vk': 'https://vk.com/arbuz' } },
    { type: 'node', id: 3, lat: 55.752, lon: 37.63, tags: { amenity: 'cafe', name: 'Банан OSM' } },
  ],
};
