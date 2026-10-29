// Яндекс Карта (JS API v3). Ключ подставляется в URL скрипта из localStorage.
// Копирайты и логотип рисует сам JS API, мы их ничем не перекрываем.

import { YANDEX } from './config.js';

const MOSCOW = { center: [37.62, 55.75], zoom: 10 };

let ymaps = null;
let map = null;
let scheme = null;
let areaFeature = null;
let onMarkerClick = () => {};
const markers = new Map(); // uid -> { marker, el, coords }

function loadScript(apikey) {
  return new Promise((resolve, reject) => {
    if (window.ymaps3) return resolve(window.ymaps3);
    const s = document.createElement('script');
    s.src = `${YANDEX.mapScript}?apikey=${encodeURIComponent(apikey)}&lang=ru_RU`;
    s.async = true;
    const timer = setTimeout(() => reject(new Error('таймаут загрузки JS API')), 20000);
    s.onload = () => { clearTimeout(timer); window.ymaps3 ? resolve(window.ymaps3) : reject(new Error('скрипт загрузился, но ymaps3 не появился')); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('скрипт JS API не загрузился')); };
    document.head.appendChild(s);
  });
}

function openInMapsHref() {
  const c = (map && map.center) || MOSCOW.center;
  const z = Math.round((map && map.zoom) || MOSCOW.zoom);
  return `https://yandex.ru/maps/?ll=${c[0].toFixed(5)},${c[1].toFixed(5)}&z=${z}`;
}

// Штатная кнопка "Открыть в Картах" из модуля controls-extra. Если модуль не
// загрузился, показываем свою ссылку, чтобы требование Яндекса всё равно выполнялось.
async function addOpenMapsButton(overlay) {
  try {
    const { YMapOpenMapsButton } = await ymaps.import('@yandex/ymaps3-controls-extra');
    const controls = new ymaps.YMapControls({ position: 'bottom left' });
    controls.addChild(new YMapOpenMapsButton({}));
    map.addChild(controls);
    return 'native';
  } catch (e) {
    console.warn('[map] YMapOpenMapsButton недоступен, ставлю свою ссылку', e);
    const a = document.createElement('a');
    a.className = 'map-open-link';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Открыть в Яндекс Картах';
    a.href = openInMapsHref();
    a.addEventListener('pointerdown', () => { a.href = openInMapsHref(); });
    a.addEventListener('focus', () => { a.href = openInMapsHref(); });
    overlay.appendChild(a);
    return 'fallback';
  }
}

function addZoomButtons(overlay) {
  const box = document.createElement('div');
  box.className = 'map-zoom';
  for (const [label, delta, title] of [['+', 1, 'Приблизить'], ['−', -1, 'Отдалить']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => {
      const z = Math.max(2, Math.min(21, (map.zoom || MOSCOW.zoom) + delta));
      map.update({ location: { center: map.center, zoom: z, duration: 200 } });
    });
    box.appendChild(b);
  }
  overlay.appendChild(box);
}

export async function init(container, apikey, { theme = 'light', onClick } = {}) {
  if (onClick) onMarkerClick = onClick;
  ymaps = await loadScript(apikey);
  await ymaps.ready;
  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps;
  map = new YMap(container, { location: MOSCOW, theme });
  scheme = new YMapDefaultSchemeLayer({ theme });
  map.addChild(scheme);
  map.addChild(new YMapDefaultFeaturesLayer({}));
  // Оверлеи вешаем на обёртку, а не внутрь контейнера, которым управляет YMap.
  const overlay = container.parentElement || container;
  addZoomButtons(overlay);
  const openBtn = await addOpenMapsButton(overlay);
  return { openBtn };
}

export const isReady = () => !!map;

export function setTheme(theme) {
  if (!map) return;
  try { map.update({ theme }); } catch { /* старые версии без theme у YMap */ }
  try { scheme.update({ theme }); } catch { /* нет темы у слоя */ }
}

function boundsOf(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of points) {
    w = Math.min(w, lon); e = Math.max(e, lon);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [[w, s], [e, n]];
}

export function showArea(ll, spn) {
  if (!map) return;
  const w = ll[0] - spn[0] / 2, e = ll[0] + spn[0] / 2;
  const s = ll[1] - spn[1] / 2, n = ll[1] + spn[1] / 2;
  try {
    if (areaFeature) map.removeChild(areaFeature);
    areaFeature = new ymaps.YMapFeature({
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      style: { stroke: [{ color: '#6366f1', width: 2, dash: [6, 4] }], fill: 'rgba(99,102,241,0.06)' },
    });
    map.addChild(areaFeature);
  } catch (err) {
    console.warn('[map] не удалось нарисовать область', err);
  }
  map.update({ location: { bounds: [[w, s], [e, n]], duration: 300 } });
}

// Видимая область карты в формате ll/spn для запроса.
export function visibleArea() {
  if (!map || !map.bounds) return null;
  const [a, b] = map.bounds;
  const w = Math.min(a[0], b[0]), e = Math.max(a[0], b[0]);
  const s = Math.min(a[1], b[1]), n = Math.max(a[1], b[1]);
  return { ll: [(w + e) / 2, (s + n) / 2], spn: [e - w, n - s] };
}

export function setMarkers(items, colorOf) {
  if (!map) return;
  for (const { marker } of markers.values()) map.removeChild(marker);
  markers.clear();
  for (const item of items) {
    if (!item.coords) continue;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'marker';
    el.style.setProperty('--c', colorOf(item));
    el.title = item.name;
    el.setAttribute('aria-label', item.name);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onMarkerClick(item.uid); });
    const marker = new ymaps.YMapMarker({ coordinates: item.coords, id: item.uid }, el);
    map.addChild(marker);
    markers.set(item.uid, { marker, el, coords: item.coords });
  }
}

export function recolor(colorOf, items) {
  for (const item of items) {
    const m = markers.get(item.uid);
    if (m) m.el.style.setProperty('--c', colorOf(item));
  }
}

export function setDimmed(dimmedUids) {
  for (const [uid, { el }] of markers) el.classList.toggle('dimmed', dimmedUids.has(uid));
}

export function focus(uid) {
  const m = markers.get(uid);
  if (!m || !map) return;
  for (const { el } of markers.values()) el.classList.remove('active');
  m.el.classList.add('active');
  map.update({ location: { center: m.coords, zoom: Math.max(map.zoom || 0, 15), duration: 400 } });
}

export function fitTo(items) {
  const pts = items.map((x) => x.coords).filter(Boolean);
  if (!map || !pts.length) return;
  map.update({ location: { bounds: boundsOf(pts), duration: 300 } });
}
