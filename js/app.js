import { YANDEX, CATEGORIES, AREAS, STATUS, STATUS_ORDER } from './config.js';
import * as store from './storage.js';
import * as quota from './quota.js';
import { classify } from './classify.js';
import * as yandex from './sources/yandex.js';
import * as osm from './sources/osm.js';
import * as mapView from './map.js';
import * as table from './table.js';

const $ = (id) => document.getElementById(id);
const VISIBLE_AREA = '__visible__';
const SAME_KEYS = 'Ключ поиска совпадает с ключом карты. Это два разных ключа: в кабинете у «API Поиска по организациям» свой ключ, отдельный от «JavaScript API».';

// Всё, что пришло из API, живёт только здесь, в памяти вкладки.
const state = {
  source: 'yandex',
  items: [],
  seen: new Set(),
  query: null,
  nextSkip: 0,
  rawLoaded: 0,
  found: 0,
  exhausted: true,
  filter: 'all',
  sort: 'api',
  busy: false,
  abort: null,
  mapState: 'none', // none | loading | ready | error
  // Ключ поиска, который уже вернул 403. Без подтверждения повторно его не дёргаем,
  // чтобы не жечь квоту кликами.
  rejectedKey: null,
};

const classCache = new WeakMap();
function classOf(item) {
  let c = classCache.get(item);
  if (!c) {
    c = classify(item.url);
    classCache.set(item, c);
  }
  // Этап 2: аудит может перевести "Есть сайт" в "Устаревший сайт".
  if (c.status === 'site' && item.audit && item.audit.outdated) return { ...c, status: 'outdated' };
  return c;
}
const colorOf = (item) => STATUS[classOf(item).status].color;

/* ---------- UI helpers ---------- */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function showAlert(msg, kind = 'error') {
  const a = $('alert');
  if (!msg) { a.hidden = true; return; }
  a.className = 'alert' + (kind === 'info' ? ' info' : '');
  a.textContent = msg;
  a.hidden = false;
}

function keys() {
  return {
    search: (store.get(store.KEYS.searchKey, '') || '').trim(),
    map: (store.get(store.KEYS.mapKey, '') || '').trim(),
  };
}

function effectiveTheme() {
  const t = store.get(store.KEYS.theme, 'auto');
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ---------- quota ---------- */

function renderQuota() {
  const used = quota.getUsed();
  const cap = quota.getCap();
  const pill = $('quota-pill');
  pill.textContent = `Запросы: ${used} / ${cap}`;
  pill.classList.toggle('warn', used >= cap * 0.8 && used < cap);
  pill.classList.toggle('stop', used >= cap);
  const over = quota.getDailyLimit() > 100 ? ' Внимание: пробный тариф даёт 100 запросов в сутки. Больше ставь, только если купил платный, иначе Яндекс может заблокировать ключ.' : '';
  $('cap-hint').textContent = `Останавливаемся на ${cap} (лимит ${quota.getDailyLimit()} минус 10%). Сброс в 00:00 по Москве.${over}`;
  renderControls();
}

/* ---------- forms ---------- */

function fillSelects() {
  const cat = $('category');
  for (const c of CATEGORIES) cat.append(new Option(c.label, c.id));
  const area = $('area');
  for (const g of AREAS) {
    const og = document.createElement('optgroup');
    og.label = g.group;
    for (const a of g.items) og.append(new Option(a.label, a.id));
    area.append(og);
  }
  const og = document.createElement('optgroup');
  og.label = 'Карта';
  og.append(new Option('Видимая область карты', VISIBLE_AREA));
  area.append(og);
  area.value = 'cao';
}

function findArea(id) {
  for (const g of AREAS) for (const a of g.items) if (a.id === id) return a;
  return null;
}

function readQuery() {
  const cat = CATEGORIES.find((c) => c.id === $('category').value);
  const custom = $('custom-text').value.trim();
  const text = cat.id === 'custom' ? custom : cat.text;
  if (!text) return { error: 'Введи свой запрос.' };
  const areaId = $('area').value;
  let area;
  if (areaId === VISIBLE_AREA) {
    const v = mapView.visibleArea();
    if (!v) return { error: 'Карта ещё не загружена, выбери область из списка.' };
    area = { label: 'видимая область карты', ...v };
  } else {
    area = findArea(areaId);
  }
  return {
    source: state.source,
    text,
    filters: cat.id === 'custom' ? [] : cat.osm,
    ll: area.ll,
    spn: area.spn,
    label: `${cat.id === 'custom' ? `«${custom}»` : cat.label} · ${area.label}`,
  };
}

/* ---------- search ---------- */

function resetResults() {
  state.items = [];
  state.seen = new Set();
  state.nextSkip = 0;
  state.rawLoaded = 0;
  state.found = 0;
  state.exhausted = true;
}

function pagesLeft() {
  if (state.source !== 'yandex' || state.exhausted) return 0;
  const byFound = Math.ceil((Math.min(state.found, YANDEX.maxSkip + YANDEX.pageSize) - state.rawLoaded) / YANDEX.pageSize);
  const bySkip = Math.floor((YANDEX.maxSkip - state.nextSkip) / YANDEX.pageSize) + 1;
  return Math.max(0, Math.min(byFound, bySkip));
}

async function fetchYandexPage() {
  const k = keys();
  if (!quota.spend()) {
    renderQuota();
    throw Object.assign(new Error('quota'), { quota: true });
  }
  renderQuota();
  const q = state.query;
  const res = await yandex.search({
    apikey: k.search, text: q.text, ll: q.ll, spn: q.spn,
    skip: state.nextSkip, results: YANDEX.pageSize,
  }, state.abort.signal);
  if (state.nextSkip === 0) state.found = res.found;
  state.rawLoaded += res.rawCount;
  let added = 0;
  for (const it of res.items) {
    // Дубли между страницами одной выдачи не показываем повторно.
    if (state.seen.has(it.uid)) continue;
    state.seen.add(it.uid);
    state.items.push(it);
    added++;
  }
  state.nextSkip += YANDEX.pageSize;
  state.exhausted = res.rawCount < YANDEX.pageSize
    || state.nextSkip > YANDEX.maxSkip
    || state.rawLoaded >= state.found;
  return added;
}

async function runOsm() {
  const q = state.query;
  const res = await osm.search({ filters: q.filters, text: q.text, ll: q.ll, spn: q.spn }, state.abort.signal);
  for (const it of res.items) {
    if (state.seen.has(it.uid)) continue;
    state.seen.add(it.uid);
    state.items.push(it);
  }
  state.found = state.items.length;
  state.exhausted = true;
}

function errorText(err) {
  if (err.quota) return `Суточный лимит в приложении исчерпан (${quota.getCap()} запросов, это лимит тарифа минус 10%). Счётчик сбросится в 00:00 по Москве.`;
  return state.source === 'yandex' ? yandex.humanError(err) : osm.humanError(err);
}

async function withBusy(fn) {
  if (state.busy) return;
  state.busy = true;
  state.abort = new AbortController();
  showAlert(null);
  renderControls();
  try {
    await fn();
  } catch (err) {
    if (err.name !== 'AbortError') {
      if (err instanceof yandex.ApiError && err.status === 403) state.rejectedKey = keys().search;
      console.error('[search]', err);
      showAlert(errorText(err));
    }
  } finally {
    state.busy = false;
    state.abort = null;
    renderAll();
  }
}

function precheck() {
  const k = keys();
  if (state.source === 'yandex') {
    if (!k.search) return 'Нужен ключ API Поиска по организациям. Открой «Ключи».';
    if (!k.map) return 'Нужен ключ JavaScript API: данные Яндекса по условиям обязательно показываются на карте.';
    if (k.search === k.map) return SAME_KEYS;
    if (state.mapState === 'error') return 'Карта не загрузилась. По условиям Яндекса данные поиска показываются только вместе с картой, поэтому сначала почини ключ JavaScript API (подробности в Console).';
    if (!quota.canSpend(1)) return errorText({ quota: true });
  }
  return null;
}

function confirmRejectedKey() {
  if (state.source !== 'yandex' || !state.rejectedKey || state.rejectedKey !== keys().search) return true;
  return window.confirm('Этот ключ поиска уже вернул 403. Каждая попытка тратит запрос из суточного лимита. Сначала проверь ключ в кабинете. Всё равно повторить?');
}

async function onSearch(e) {
  e.preventDefault();
  if (!confirmRejectedKey()) return;
  const problem = precheck();
  if (problem) { showAlert(problem); if (!keys().search || !keys().map) openSettings(true); return; }
  const q = readQuery();
  if (q.error) { showAlert(q.error); return; }
  resetResults();
  state.query = q;
  mapView.showArea(q.ll, q.spn);
  renderAll();
  await withBusy(async () => {
    if (state.source === 'yandex') await fetchYandexPage();
    else await runOsm();
    if (state.items.length) mapView.fitTo(state.items);
  });
}

async function onMore() {
  if (!confirmRejectedKey()) return;
  if (precheck()) { showAlert(precheck()); return; }
  await withBusy(() => fetchYandexPage());
}

async function onLoadAll() {
  const need = pagesLeft();
  const left = quota.remaining();
  const spend = Math.min(need, left);
  if (!spend) { showAlert(errorText({ quota: true })); return; }
  const msg = need > left
    ? `Осталось страниц: ${need}, а запросов на сегодня ${left}. Загрузить ${spend} страниц(ы) и упереться в лимит?`
    : `Загрузить оставшиеся ${need} страниц(ы)? Это ${need} запрос(ов) из ${left} оставшихся на сегодня.`;
  if (!window.confirm(msg)) return;
  await withBusy(async () => {
    for (let i = 0; i < spend && !state.exhausted; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, YANDEX.pageDelayMs));
      if (state.abort.signal.aborted) break;
      await fetchYandexPage();
      renderAll();
    }
  });
}

/* ---------- render ---------- */

function orderedItems() {
  if (state.source !== 'osm' || state.sort === 'api') return state.items;
  const copy = state.items.slice();
  if (state.sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (state.sort === 'status') copy.sort((a, b) => STATUS_ORDER.indexOf(classOf(a).status) - STATUS_ORDER.indexOf(classOf(b).status));
  return copy;
}

function counts() {
  const c = { all: state.items.length, none: 0, social: 0, site: 0, outdated: 0 };
  for (const it of state.items) c[classOf(it).status]++;
  return c;
}

function renderChips() {
  const c = counts();
  const box = $('chips');
  box.replaceChildren();
  const defs = [['all', 'Все', null], ...STATUS_ORDER.map((s) => [s, STATUS[s].label, STATUS[s].color])];
  for (const [id, label, color] of defs) {
    if (id === 'outdated' && !c.outdated) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.filter = id;
    b.setAttribute('aria-pressed', String(state.filter === id));
    if (color) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.setProperty('--c', color);
      b.append(dot);
    }
    b.append(document.createTextNode(label + ' '));
    const n = document.createElement('span');
    n.className = 'count';
    n.textContent = String(c[id]);
    b.append(n);
    b.addEventListener('click', () => { state.filter = id; applyFilter(); renderChips(); });
    box.append(b);
  }
}

function dimmedSet() {
  const s = new Set();
  if (state.filter === 'all') return s;
  for (const it of state.items) if (classOf(it).status !== state.filter) s.add(it.uid);
  return s;
}

function applyFilter() {
  const d = dimmedSet();
  table.setDimmed(d);
  mapView.setDimmed(d);
}

function renderSummary() {
  const s = $('summary');
  if (!state.query) { s.textContent = 'Пока ничего не искали.'; return; }
  const q = state.query;
  if (state.busy && !state.items.length) { s.textContent = `Ищу: ${q.label}…`; return; }
  const src = q.source === 'yandex' ? 'Яндекс' : 'OSM';
  const total = q.source === 'yandex' && state.found ? ` из ~${state.found}` : '';
  s.textContent = `${q.label} · ${src}: показано ${state.items.length}${total}`;
}

function renderControls() {
  const yandexMode = state.source === 'yandex';
  const left = pagesLeft();
  const more = $('more-btn'), all = $('all-btn'), stop = $('stop-btn');
  more.hidden = !(yandexMode && state.query && left > 0);
  all.hidden = more.hidden || left < 2;
  more.disabled = state.busy || !quota.canSpend(1);
  all.disabled = state.busy || !quota.canSpend(1);
  more.textContent = `Ещё ${YANDEX.pageSize} (−1 запрос)`;
  all.textContent = `Загрузить всё (до ${left} запр.)`;
  stop.hidden = !state.busy;
  $('search-btn').disabled = state.busy;
  $('search-btn').textContent = state.busy ? 'Ищу…' : (yandexMode ? 'Найти (−1 запрос)' : 'Найти в OSM');

  const sort = $('sort');
  sort.disabled = yandexMode;
  if (yandexMode) sort.value = 'api';

  $('search-hint').textContent = yandexMode
    ? `Каждая страница выдачи это 1 запрос и до ${YANDEX.pageSize} организаций. Максимум ${YANDEX.maxSkip / YANDEX.pageSize + 1} страниц на запрос. Ищи по округам: так меньше пустых страниц.`
    : 'OpenStreetMap: бесплатно и без ключа, но сайты и телефоны заполнены хуже. "Нет сайта в OSM" не значит "нет сайта".';
}

function renderAttribution() {
  const a = $('attribution');
  a.replaceChildren();
  const src = state.query ? state.query.source : state.source;
  if (src === 'yandex') {
    a.append(document.createTextNode('Данные об организациях предоставлены Яндексом (API Поиска по организациям). '));
  } else {
    a.append(document.createTextNode('Данные: © '));
    const l = document.createElement('a');
    l.href = 'https://www.openstreetmap.org/copyright';
    l.target = '_blank';
    l.rel = 'noopener';
    l.textContent = 'участники OpenStreetMap';
    a.append(l, document.createTextNode(', лицензия ODbL.'));
  }
}

function renderAll() {
  table.render(orderedItems(), classOf, { onFocus: focusItem, onCopy: copyContact });
  mapView.setMarkers(state.items, colorOf);
  applyFilter();
  renderChips();
  renderSummary();
  renderControls();
  renderAttribution();
}

function focusItem(uid) {
  table.highlight(uid, false);
  mapView.focus(uid);
}

/* ---------- copy ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyContact(item, cls) {
  const lines = [item.name];
  if (item.category) lines.push(item.category);
  if (item.address) lines.push(item.address);
  if (item.phones.length) lines.push('Тел: ' + item.phones.join(', '));
  lines.push('Сайт: ' + (cls.href || 'нет') + (cls.status === 'social' ? ' (соцсеть/агрегатор)' : ''));
  if (item.cardUrl) lines.push(`${item.cardLabel}: ${item.cardUrl}`);
  toast((await copyText(lines.join('\n'))) ? 'Контакт скопирован' : 'Не получилось скопировать: браузер не дал доступ к буферу');
}

/* ---------- settings ---------- */

function openSettings(open) {
  const s = $('settings');
  const isOpen = open ?? s.hidden;
  s.hidden = !isOpen;
  $('settings-btn').setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    const k = keys();
    $('search-key').value = k.search;
    $('map-key').value = k.map;
    $('daily-limit').value = quota.getDailyLimit();
  }
}

function onSaveKeys(e) {
  e.preventDefault();
  const before = keys();
  const search = $('search-key').value.trim();
  const mapKey = $('map-key').value.trim();
  if (search) store.set(store.KEYS.searchKey, search); else store.remove(store.KEYS.searchKey);
  if (mapKey) store.set(store.KEYS.mapKey, mapKey); else store.remove(store.KEYS.mapKey);
  quota.setDailyLimit($('daily-limit').value);
  renderQuota();
  if (search && search === mapKey) { showAlert(SAME_KEYS); return; }
  openSettings(false);
  showAlert(null);
  toast('Сохранено в этом браузере');
  if (mapKey && mapKey !== before.map) {
    // JS API нельзя переинициализировать с другим ключом без перезагрузки.
    // Если скрипт так и не загрузился, можно грузить с новым ключом без перезагрузки.
    if (state.mapState === 'none' || state.mapState === 'error') startMap();
    else location.reload();
  }
}

function onForget() {
  if (!window.confirm('Удалить оба ключа из этого браузера? Результаты поиска тоже пропадут.')) return;
  store.remove(store.KEYS.searchKey);
  store.remove(store.KEYS.mapKey);
  location.reload();
}

/* ---------- theme ---------- */

const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
const THEME_NAME = { auto: 'авто', light: 'светлая', dark: 'тёмная' };

function applyTheme() {
  const t = store.get(store.KEYS.theme, 'auto');
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const b = $('theme-btn');
  b.textContent = THEME_ICON[t] || THEME_ICON.auto;
  b.title = `Тема: ${THEME_NAME[t] || 'авто'}`;
  mapView.setTheme(effectiveTheme());
}

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const t = store.get(store.KEYS.theme, 'auto');
  const next = order[(order.indexOf(t) + 1) % order.length];
  if (next === 'auto') store.remove(store.KEYS.theme); else store.set(store.KEYS.theme, next);
  applyTheme();
}

/* ---------- map ---------- */

async function startMap() {
  const k = keys();
  if (!k.map) return;
  state.mapState = 'loading';
  $('map-placeholder').hidden = false;
  $('map-placeholder').textContent = 'Загружаю карту…';
  try {
    const { openBtn } = await mapView.init($('map'), k.map, {
      theme: effectiveTheme(),
      onClick: (uid) => table.highlight(uid, true),
    });
    state.mapState = 'ready';
    $('map-placeholder').hidden = true;
    if (openBtn === 'fallback') console.info('[map] кнопка "Открыть в Картах" заменена ссылкой');
    if (state.query) { mapView.setMarkers(state.items, colorOf); applyFilter(); }
  } catch (err) {
    state.mapState = 'error';
    console.error('[map]', err);
    const ph = $('map-placeholder');
    ph.replaceChildren();
    const box = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'Карта не загрузилась. Частые причины: ключ JavaScript API ещё не активировался (до 15 минут), в ключе не указан Referer ermin372.github.io или в ключе опечатка. В DevTools → Network запрос api-maps покажет код ответа.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-primary';
    retry.textContent = 'Повторить';
    retry.addEventListener('click', () => { showAlert(null); startMap(); });
    box.append(p, retry);
    ph.append(box);
  }
}

/* ---------- init ---------- */

function setSource(src) {
  state.source = src === 'osm' ? 'osm' : 'yandex';
  store.set(store.KEYS.source, state.source);
  for (const r of document.querySelectorAll('input[name="source"]')) r.checked = r.value === state.source;
  renderControls();
  renderAttribution();
}

function init() {
  fillSelects();
  setSource(store.get(store.KEYS.source, 'yandex'));
  applyTheme();
  renderQuota();
  renderAll();

  $('search-form').addEventListener('submit', onSearch);
  $('category').addEventListener('change', () => { $('custom-wrap').hidden = $('category').value !== 'custom'; });
  for (const r of document.querySelectorAll('input[name="source"]')) r.addEventListener('change', () => setSource(r.value));
  $('more-btn').addEventListener('click', onMore);
  $('all-btn').addEventListener('click', onLoadAll);
  $('stop-btn').addEventListener('click', () => state.abort && state.abort.abort());
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; renderAll(); });
  $('settings-btn').addEventListener('click', () => openSettings());
  $('keys-form').addEventListener('submit', onSaveKeys);
  $('forget-btn').addEventListener('click', onForget);
  $('theme-btn').addEventListener('click', cycleTheme);
  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.addEventListener('click', () => {
      const inp = $(b.dataset.toggle);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      b.textContent = inp.type === 'password' ? 'показать' : 'скрыть';
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  quota.onExternalChange(renderQuota);

  const k = keys();
  if (!k.search && !k.map) {
    openSettings(true);
    showAlert('Для старта введи ключи: «API Поиска по организациям» и «JavaScript API». Без ключей работает только источник OpenStreetMap.', 'info');
  }
  startMap();
}

init();
