// Все настраиваемые вещи в одном месте. Секретов здесь нет и быть не должно:
// ключи вводятся в интерфейсе и живут только в localStorage браузера.

export const YANDEX = {
  endpoint: 'https://search-maps.yandex.ru/v1/',
  lang: 'ru_RU',
  // Из доки: results максимум 50, skip максимум 1000 и должен делиться на results.
  pageSize: 50,
  maxSkip: 1000,
  // Пауза между страницами при "Загрузить всё", чтобы не ловить 429.
  pageDelayMs: 300,
  mapScript: 'https://api-maps.yandex.ru/v3/',
  cardUrl: (id) => `https://yandex.ru/maps/org/${encodeURIComponent(id)}/`,
};

export const QUOTA = {
  // Пробный тариф API Поиска по организациям: 100 запросов в сутки, 7 дней.
  // Меняется в интерфейсе, если купишь платный тариф.
  defaultDailyLimit: 100,
  // Запас 10%: останавливаемся на floor(limit * 0.9).
  safetyMargin: 0.1,
  // По какому поясу Яндекс считает сутки, в доке не нашёл. Берём Москву.
  timeZone: 'Europe/Moscow',
};

export const OSM = {
  // Публичные инстансы Overpass. Если первый не ответил, пробуем следующий.
  endpoints: [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ],
  timeoutSec: 25,
  maxResults: 500,
  objectUrl: (type, id) => `https://www.openstreetmap.org/${type}/${id}`,
};

// Пресеты категорий. text уходит в Яндекс, osm это фильтры тегов Overpass QL
// (каждая строка это отдельная ветка union).
export const CATEGORIES = [
  { id: 'cafe', label: 'Кафе', text: 'кафе', osm: ['["amenity"="cafe"]', '["amenity"="restaurant"]'] },
  { id: 'coffee', label: 'Кофейня', text: 'кофейня', osm: ['["amenity"="cafe"]["cuisine"~"coffee"]', '["amenity"="cafe"]["name"~"кофе|coffee",i]'] },
  { id: 'flowers', label: 'Цветы', text: 'цветы', osm: ['["shop"="florist"]'] },
  { id: 'barber', label: 'Барбершоп', text: 'барбершоп', osm: ['["shop"="hairdresser"]["hairdresser"="barber"]', '["shop"="hairdresser"]["name"~"барбер|barber",i]'] },
  { id: 'beauty', label: 'Салон красоты', text: 'салон красоты', osm: ['["shop"="beauty"]', '["shop"="hairdresser"]'] },
  { id: 'bakery', label: 'Пекарня', text: 'пекарня', osm: ['["shop"="bakery"]'] },
  { id: 'autoservice', label: 'Автосервис', text: 'автосервис', osm: ['["shop"="car_repair"]'] },
  { id: 'custom', label: 'Свой запрос…', text: '', osm: [] },
];

// Области поиска: центр [долгота, широта] и размер [Δдолгота, Δширота].
// Границы приблизительные, нарисованы на глаз по карте. Для точной области
// есть режим "видимая область карты".
export const AREAS = [
  { group: 'Москва', items: [
    { id: 'msk', label: 'Москва (в пределах МКАД)', ll: [37.62, 55.75], spn: [0.64, 0.37] },
    { id: 'cao', label: 'ЦАО', ll: [37.615, 55.752], spn: [0.17, 0.07] },
    { id: 'sao', label: 'САО', ll: [37.51, 55.855], spn: [0.22, 0.11] },
    { id: 'svao', label: 'СВАО', ll: [37.635, 55.86], spn: [0.17, 0.12] },
    { id: 'vao', label: 'ВАО', ll: [37.82, 55.77], spn: [0.25, 0.14] },
    { id: 'yuvao', label: 'ЮВАО', ll: [37.785, 55.685], spn: [0.23, 0.11] },
    { id: 'yuao', label: 'ЮАО', ll: [37.66, 55.64], spn: [0.18, 0.14] },
    { id: 'yuzao', label: 'ЮЗАО', ll: [37.535, 55.635], spn: [0.17, 0.15] },
    { id: 'zao', label: 'ЗАО', ll: [37.44, 55.70], spn: [0.22, 0.14] },
    { id: 'szao', label: 'СЗАО', ll: [37.435, 55.835], spn: [0.17, 0.13] },
    { id: 'zelao', label: 'Зеленоград', ll: [37.19, 55.985], spn: [0.12, 0.07] },
    { id: 'nao', label: 'Новая Москва (север НАО)', ll: [37.40, 55.54], spn: [0.30, 0.18] },
  ] },
  { group: 'Подмосковье', items: [
    { id: 'khimki', label: 'Химки', ll: [37.43, 55.89], spn: [0.12, 0.07] },
    { id: 'mytishchi', label: 'Мытищи', ll: [37.73, 55.91], spn: [0.12, 0.07] },
    { id: 'korolev', label: 'Королёв', ll: [37.83, 55.92], spn: [0.10, 0.06] },
    { id: 'balashikha', label: 'Балашиха', ll: [37.95, 55.80], spn: [0.16, 0.08] },
    { id: 'lyubertsy', label: 'Люберцы', ll: [37.90, 55.68], spn: [0.10, 0.06] },
    { id: 'reutov', label: 'Реутов', ll: [37.86, 55.76], spn: [0.05, 0.03] },
    { id: 'podolsk', label: 'Подольск', ll: [37.55, 55.43], spn: [0.14, 0.08] },
    { id: 'krasnogorsk', label: 'Красногорск', ll: [37.33, 55.82], spn: [0.10, 0.06] },
    { id: 'odintsovo', label: 'Одинцово', ll: [37.28, 55.68], spn: [0.10, 0.06] },
    { id: 'dolgoprudny', label: 'Долгопрудный', ll: [37.50, 55.94], spn: [0.07, 0.04] },
    { id: 'vidnoe', label: 'Видное', ll: [37.71, 55.55], spn: [0.07, 0.04] },
    { id: 'domodedovo', label: 'Домодедово', ll: [37.75, 55.44], spn: [0.10, 0.06] },
    { id: 'pushkino', label: 'Пушкино', ll: [37.85, 56.01], spn: [0.08, 0.05] },
    { id: 'shchyolkovo', label: 'Щёлково', ll: [38.00, 55.92], spn: [0.08, 0.05] },
    { id: 'ramenskoe', label: 'Раменское', ll: [38.23, 55.57], spn: [0.08, 0.05] },
    { id: 'zhukovsky', label: 'Жуковский', ll: [38.12, 55.60], spn: [0.07, 0.04] },
    { id: 'elektrostal', label: 'Электросталь', ll: [38.45, 55.78], spn: [0.08, 0.05] },
    { id: 'sergiev', label: 'Сергиев Посад', ll: [38.13, 56.31], spn: [0.08, 0.05] },
    { id: 'kolomna', label: 'Коломна', ll: [38.78, 55.10], spn: [0.10, 0.06] },
    { id: 'serpukhov', label: 'Серпухов', ll: [37.41, 54.92], spn: [0.10, 0.06] },
  ] },
];

// Если url организации ведёт на один из этих доменов (или их поддомен),
// считаем, что вместо сайта соцсеть, мессенджер, мультиссылка или агрегатор.
export const SOCIAL_DOMAINS = [
  // соцсети
  'vk.com', 'vk.ru', 'vk.me', 'vkontakte.ru', 'ok.ru', 'odnoklassniki.ru',
  'instagram.com', 'instagr.am', 'facebook.com', 'fb.com', 'fb.me',
  'tiktok.com', 'youtube.com', 'youtu.be', 'dzen.ru', 'pinterest.com', 'pinterest.ru',
  // мессенджеры
  't.me', 'telegram.me', 'telegram.org', 'wa.me', 'whatsapp.com', 'viber.com', 'max.ru',
  // мультиссылки
  'taplink.cc', 'taplink.ru', 'taplink.at', 'linktr.ee', 'mssg.me', 'hipolink.me', 'hipolink.net', 'link.me',
  // карты и справочники
  '2gis.ru', '2gis.com', 'yandex.ru', 'yandex.com', 'ya.ru', 'google.com', 'goo.gl', 'zoon.ru', 'flamp.ru',
  // маркетплейсы и агрегаторы
  'avito.ru', 'flowwow.com', 'ozon.ru', 'wildberries.ru', 'delivery-club.ru',
  // онлайн-запись (у барбершопов и салонов часто стоит вместо сайта)
  'yclients.com', 'dikidi.net', 'dikidi.ru', 'dikidi.app', 'sonline.su', 'restoplace.ws',
];

// Бесплатные конструкторы и хостинги: сайт формально есть, но это повод присмотреться.
export const FREE_HOSTING_DOMAINS = [
  'tilda.ws', 'wixsite.com', 'nethouse.ru', 'ukit.me', 'ucoz.ru', 'ucoz.net', 'ucoz.com', 'ucoz.org',
  'narod.ru', 'narod2.ru', 'jimdosite.com', 'webnode.ru', 'mya5.ru', 'turbo.site', 'business.site',
  'okis.ru', 'umi.ru', 'setup.ru', 'blogspot.com', 'wordpress.com', 'tb.ru',
];

export const STATUS = {
  none: { label: 'Нет сайта', color: '#e5484d' },
  social: { label: 'Соцсеть вместо сайта', color: '#f59e0b' },
  site: { label: 'Есть сайт', color: '#3b82f6' },
  // Этап 2: появится после аудита через Worker.
  outdated: { label: 'Устаревший сайт', color: '#8b5cf6' },
};

export const STATUS_ORDER = ['none', 'social', 'site', 'outdated'];
