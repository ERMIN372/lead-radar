// Автопроверка UI без реальных ключей: API Яндекса, JS API карты и Overpass
// подменяются заглушками через page.route. Живой API так не проверить,
// для него есть ручной чек-лист в README.
//
// Запуск: node tests/smoke.mjs   (нужен Playwright с Chromium)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as fx from './fixtures/yandex.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, 'tests', 'screenshots');
const STUB = fs.readFileSync(path.join(ROOT, 'tests/stubs/ymaps3-stub.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function serve() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log('  ✓', name);
  } catch (e) {
    results.push(['FAIL', name, e]);
    console.log('  ✗', name, '\n    ', e.message.split('\n').join('\n     '));
  }
}

async function setup(browser, base, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, colorScheme: opts.colorScheme || 'light' });
  const page = await context.newPage();
  const log = { errors: [], yandexRequests: [], overpass: 0 };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  await page.route('https://api-maps.yandex.ru/**', (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.route('https://search-maps.yandex.ru/**', (r) => {
    const u = new URL(r.request().url());
    log.yandexRequests.push(u);
    if (opts.yandexStatus) {
      return r.fulfill({ status: opts.yandexStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ statusCode: opts.yandexStatus, error: 'Forbidden', message: 'Invalid apikey' }) });
    }
    const body = fx.page({ skip: Number(u.searchParams.get('skip') || 0), results: Number(u.searchParams.get('results')), found: opts.found ?? 120 });
    return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route(/overpass|maps\.mail\.ru/, (r) => { log.overpass++; r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx.overpass) }); });
  if (opts.storage) {
    await context.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, opts.storage);
  }
  await page.goto(base);
  return { context, page, log };
}

const KEYS = { 'lr.key.search': 'test-search-key', 'lr.key.map': 'test-map-key' };

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  console.log('Lead Radar smoke tests @', base);

  await step('первый запуск: без ключей открываются настройки и подсказка', async () => {
    const { context, page, log } = await setup(browser, base);
    assert.equal(await page.isVisible('#settings'), true);
    assert.match(await page.textContent('#alert'), /ключи/i);
    assert.equal(log.yandexRequests.length, 0, 'без действий пользователя запросов быть не должно');
    await page.screenshot({ path: path.join(SHOTS, '01-first-run.png'), fullPage: true });
    assert.deepEqual(log.errors, []);
    await context.close();
  });

  await step('ввод ключей сохраняет их в localStorage, "забыть" удаляет', async () => {
    const { context, page } = await setup(browser, base);
    await page.fill('#search-key', 'abc-search');
    await page.fill('#map-key', 'abc-map');
    await page.click('#keys-form button[type=submit]');
    assert.equal(await page.evaluate(() => localStorage.getItem('lr.key.search')), 'abc-search');
    assert.equal(await page.evaluate(() => localStorage.getItem('lr.key.map')), 'abc-map');
    page.once('dialog', (d) => d.accept());
    await page.click('#settings-btn');
    await Promise.all([page.waitForEvent('load'), page.click('#forget-btn')]);
    assert.equal(await page.evaluate(() => localStorage.getItem('lr.key.search')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('lr.key.map')), null);
    await context.close();
  });

  await step('поиск: параметры запроса, классификация, таблица, метки, XSS', async () => {
    const { context, page, log } = await setup(browser, base, { storage: KEYS });
    await page.waitForSelector('.stub-map');
    await page.selectOption('#category', 'cafe');
    await page.selectOption('#area', 'cao');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    assert.equal(log.yandexRequests.length, 1);
    const p = log.yandexRequests[0].searchParams;
    assert.equal(p.get('apikey'), 'test-search-key');
    assert.equal(p.get('text'), 'кафе');
    assert.equal(p.get('type'), 'biz');
    assert.equal(p.get('lang'), 'ru_RU');
    assert.equal(p.get('rspn'), '1');
    assert.equal(p.get('results'), '50');
    assert.equal(p.get('skip'), null);
    assert.equal(p.get('ll'), '37.615000,55.752000');
    assert.equal(p.get('spn'), '0.170000,0.070000');
    const counts = await page.$$eval('#results-body tr', (trs) => trs.reduce((a, tr) => { a[tr.dataset.status] = (a[tr.dataset.status] || 0) + 1; return a; }, {}));
    assert.deepEqual(counts, { none: 10, social: 25, site: 15 });
    assert.equal(await page.$$eval('.stub-map .marker', (m) => m.length), 50);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'XSS из названия сработал');
    assert.match(await page.textContent('#results-body tr:nth-child(4) .name'), /<img/);
    assert.match(await page.textContent('#attribution'), /Яндекс/);
    assert.match(await page.textContent('#quota-pill'), /1 \/ 90/);
    const tel = await page.getAttribute('#results-body tr:nth-child(2) a.phone', 'href');
    assert.equal(tel, 'tel:+74950000100');
    const card = await page.getAttribute('#results-body tr:nth-child(1) a.btn', 'href');
    assert.equal(card, 'https://yandex.ru/maps/org/1000000/');
    const hint = await page.textContent('#results-body tr:nth-child(7) td:nth-child(2)');
    assert.match(hint, /конструктор: tilda\.ws/);
    assert.equal(await page.textContent('#results-body tr:nth-child(8) a.site'), 'топган.рф');
    await page.screenshot({ path: path.join(SHOTS, '02-results-desktop.png'), fullPage: true });
    assert.deepEqual(log.errors, []);
    await context.close();
  });

  await step('пагинация: "Ещё 50" шлёт skip=50, "Загрузить всё" останавливается на конце выдачи', async () => {
    const { context, page, log } = await setup(browser, base, { storage: KEYS, found: 120 });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    await page.click('#more-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 100);
    assert.equal(log.yandexRequests[1].searchParams.get('skip'), '50');
    assert.equal(log.yandexRequests[1].searchParams.get('results'), '50');
    assert.equal(await page.isVisible('#more-btn'), true);
    await page.click('#more-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 120);
    assert.equal(log.yandexRequests.length, 3);
    assert.equal(await page.isVisible('#more-btn'), false, 'после конца выдачи кнопка должна пропасть');
    assert.match(await page.textContent('#quota-pill'), /3 \/ 90/);
    assert.match(await page.textContent('#summary'), /120 из ~120/);
    await context.close();
  });

  await step('"Загрузить всё" спрашивает подтверждение и укладывается в остаток квоты', async () => {
    const { context, page, log } = await setup(browser, base, { storage: { ...KEYS, 'lr.quota.limit': '5' }, found: 1000 });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    // лимит 5 → стоп на 4; один уже потрачен, осталось 3.
    let dialogText = '';
    page.once('dialog', (d) => { dialogText = d.message(); d.accept(); });
    await page.click('#all-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 200, null, { timeout: 10000 });
    assert.match(dialogText, /Загрузить 3/);
    assert.equal(log.yandexRequests.length, 4);
    assert.match(await page.textContent('#quota-pill'), /4 \/ 4/);
    assert.equal(await page.isDisabled('#more-btn'), true);
    await context.close();
  });

  await step('жёсткий стоп по квоте: запрос не уходит, показывается причина', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const { context, page, log } = await setup(browser, base, { storage: { ...KEYS, 'lr.quota.limit': '100', 'lr.quota': JSON.stringify({ day, count: 90 }) } });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForSelector('#alert:not([hidden])');
    assert.match(await page.textContent('#alert'), /лимит/i);
    assert.equal(log.yandexRequests.length, 0);
    await context.close();
  });

  await step('фильтр приглушает, но не удаляет и не переставляет строки и метки', async () => {
    const { context, page } = await setup(browser, base, { storage: KEYS });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    const before = await page.$$eval('#results-body tr', (t) => t.map((x) => x.dataset.uid));
    await page.click('.chip[data-filter="none"]');
    const after = await page.$$eval('#results-body tr', (t) => t.map((x) => x.dataset.uid));
    assert.deepEqual(after, before);
    assert.equal(await page.$$eval('#results-body tr.dimmed', (t) => t.length), 40);
    assert.equal(await page.$$eval('.stub-map .marker.dimmed', (t) => t.length), 40);
    assert.equal(await page.isDisabled('#sort'), true, 'сортировка для Яндекса должна быть выключена');
    await page.screenshot({ path: path.join(SHOTS, '03-filter-none.png'), fullPage: true });
    await context.close();
  });

  await step('в localStorage нет данных API, только разрешённые ключи', async () => {
    const { context, page } = await setup(browser, base, { storage: KEYS });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    await page.click('#theme-btn');
    const dump = await page.evaluate(() => Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
    const allowed = ['lr.key.search', 'lr.key.map', 'lr.quota', 'lr.quota.limit', 'lr.theme', 'lr.source'];
    for (const [k, v] of dump) {
      assert.ok(allowed.includes(k), `лишний ключ в localStorage: ${k}`);
      assert.ok(!/Тестовое кафе|1000000/.test(v), `данные API попали в localStorage: ${k}`);
    }
    const sess = await page.evaluate(() => sessionStorage.length);
    assert.equal(sess, 0);
    const idb = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).length : 0));
    assert.equal(idb, 0);
    await context.close();
  });

  await step('ошибка 403 показывается понятным текстом', async () => {
    const { context, page, log } = await setup(browser, base, { storage: KEYS, yandexStatus: 403 });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForSelector('#alert:not([hidden])');
    assert.match(await page.textContent('#alert'), /403/);
    assert.match(await page.textContent('#alert'), /пробный период/);
    assert.match(await page.textContent('#alert'), /Invalid apikey/);
    // Повтор с тем же ключом спрашивает подтверждение; отказ не тратит запрос.
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await page.click('#search-btn');
    await page.waitForTimeout(300);
    assert.match(asked, /уже вернул 403/);
    assert.equal(log.yandexRequests.length, 1);
    assert.match(await page.textContent('#quota-pill'), /1 \//);
    await context.close();
  });

  await step('одинаковые ключи поиска и карты: запрос не уходит', async () => {
    const { context, page, log } = await setup(browser, base, { storage: { 'lr.key.search': 'same', 'lr.key.map': 'same' } });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForSelector('#alert:not([hidden])');
    assert.match(await page.textContent('#alert'), /совпадает с ключом карты/);
    assert.equal(log.yandexRequests.length, 0);
    await context.close();
  });

  await step('без ключа карты поиск Яндекса блокируется (данные только с картой)', async () => {
    const { context, page, log } = await setup(browser, base, { storage: { 'lr.key.search': 'x' } });
    await page.click('#search-btn');
    await page.waitForSelector('#alert:not([hidden])');
    assert.match(await page.textContent('#alert'), /JavaScript API/);
    assert.equal(log.yandexRequests.length, 0);
    await context.close();
  });

  await step('кнопка "Открыть в Картах": при недоступном модуле есть запасная ссылка', async () => {
    const { context, page } = await setup(browser, base, { storage: KEYS });
    await page.waitForSelector('.map-open-link');
    const href = await page.getAttribute('.map-open-link', 'href');
    assert.match(href, /^https:\/\/yandex\.ru\/maps\/\?ll=/);
    await context.close();
  });

  await step('карта: 403 на ключ → понятная ошибка и "Повторить" без перезагрузки', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    let mapOk = false;
    await page.route('https://api-maps.yandex.ru/**', (r) => mapOk
      ? r.fulfill({ contentType: 'text/javascript', body: STUB })
      : r.fulfill({ status: 403, contentType: 'application/json', body: '{"statusCode":403,"error":"Forbidden","message":"Invalid api key"}' }));
    await context.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, KEYS);
    await page.goto(base);
    await page.waitForSelector('#map-placeholder button');
    assert.match(await page.textContent('#map-placeholder'), /не загрузилась/);
    mapOk = true;
    await page.click('#map-placeholder button');
    await page.waitForSelector('.stub-map');
    assert.equal(await page.isHidden('#map-placeholder'), true);
    await context.close();
  });

  await step('OSM: работает без ключей, сортировка доступна, атрибуция OSM', async () => {
    const { context, page, log } = await setup(browser, base);
    await page.click('#settings-btn');
    await page.click('label:has(input[name="source"][value="osm"])');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 3);
    assert.equal(log.overpass, 1);
    assert.equal(log.yandexRequests.length, 0);
    const st = await page.$$eval('#results-body tr', (t) => t.map((x) => x.dataset.status));
    assert.deepEqual(st, ['site', 'social', 'none']);
    assert.equal(await page.isDisabled('#sort'), false);
    await page.selectOption('#sort', 'status');
    const st2 = await page.$$eval('#results-body tr', (t) => t.map((x) => x.dataset.status));
    assert.deepEqual(st2, ['none', 'social', 'site']);
    assert.match(await page.textContent('#attribution'), /OpenStreetMap/);
    assert.match(await page.textContent('#quota-pill'), /0 \//);
    await context.close();
  });

  await step('Excel: Яндекс только после подтверждения, OSM сразу; файлы валидные и учитывают фильтр', async () => {
    const { context, page } = await setup(browser, base, { storage: KEYS });
    await page.waitForSelector('.stub-map');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-xlsx-'));
    let k = 0;
    const grab = async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
      const file = path.join(dir, `${k++}-${dl.suggestedFilename()}`);
      await dl.saveAs(file);
      return file;
    };
    // Яндекс: отказ в подтверждении, файла нет.
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    let downloaded = false;
    page.once('download', () => { downloaded = true; });
    let warning = '';
    page.once('dialog', (d) => { warning = d.message(); d.dismiss(); });
    await page.click('#export-btn');
    await page.waitForTimeout(300);
    assert.equal(downloaded, false);
    assert.match(warning, /на свой риск/);
    // Яндекс: подтвердили, файл есть.
    page.once('dialog', (d) => d.accept());
    const yfile = await grab();
    assert.match(path.basename(yfile), /lead-radar-yandex-cafe-cao-\d{4}-\d{2}-\d{2}\.xlsx$/);
    // OSM: выгрузка всего, потом только "Нет сайта".
    await page.click('label:has(input[name="source"][value="osm"])');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 3);
    const all = await grab();
    assert.match(path.basename(all), /lead-radar-osm-cafe-cao-\d{4}-\d{2}-\d{2}\.xlsx$/);
    await page.click('.chip[data-filter="none"]');
    assert.match(await page.textContent('#export-btn'), /\(1\)/);
    const onlyNone = await grab();
    const py = `
import sys, json, openpyxl
out = []
for f in sys.argv[1:]:
    ws = openpyxl.load_workbook(f).active
    out.append([[c for c in r] for r in ws.iter_rows(values_only=True)])
print(json.dumps(out, ensure_ascii=False))`;
    const [y, a, b] = JSON.parse(execFileSync('python3', ['-I', '-c', py, yfile, all, onlyNone], { encoding: 'utf8' }));
    assert.equal(y.filter((r) => r[1]).length - 1, 50, 'в выгрузке Яндекса 50 строк');
    assert.equal(y[0][7], 'Яндекс Карты');
    assert.equal(y[1][7], 'https://yandex.ru/maps/org/1000000/');
    assert.match(String(y[y.length - 1][0]), /Яндекс/);
    assert.deepEqual(a[0].slice(0, 3), ['Статус', 'Название', 'Категория']);
    assert.deepEqual(a.slice(1, 4).map((r) => r[1]), ['Яблоко OSM', 'Арбуз OSM', 'Банан OSM']);
    assert.equal(a[1][5], 'https://apple-cafe.ru/');
    assert.equal(a[1][8], 37.61);
    assert.match(String(a[a.length - 1][0]), /OpenStreetMap/);
    assert.deepEqual(b.slice(1).filter((r) => r[1]).map((r) => r[1]), ['Банан OSM']);
    await context.close();
  });

  await step('телефон 390px: нет горизонтального скролла, тёмная тема', async () => {
    const { context, page, log } = await setup(browser, base, { storage: KEYS, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    await page.waitForSelector('.stub-map');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.querySelectorAll('#results-body tr').length === 50);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `горизонтальный скролл ${overflow}px`);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(14, 17, 22)');
    await page.screenshot({ path: path.join(SHOTS, '04-mobile-dark.png'), fullPage: false });
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.results').offsetTop));
    await page.screenshot({ path: path.join(SHOTS, '05-mobile-dark-cards.png'), fullPage: false });
    assert.deepEqual(log.errors, []);
    await context.close();
  });

  await step('переключатель темы: авто → светлая → тёмная', async () => {
    const { context, page } = await setup(browser, base, { colorScheme: 'dark' });
    await page.click('#theme-btn');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(246, 247, 249)');
    await page.click('#theme-btn');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await context.close();
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
