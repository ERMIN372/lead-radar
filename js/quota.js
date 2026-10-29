// Суточный счётчик запросов к API Поиска по организациям.
// Считаем каждую отправленную попытку, даже если она упала: так безопаснее,
// потому что как именно Яндекс считает ошибочные запросы, в доке не описано.

import { QUOTA } from './config.js';
import * as store from './storage.js';

function today() {
  // en-CA даёт формат YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function getDailyLimit() {
  const n = parseInt(store.get(store.KEYS.dailyLimit, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : QUOTA.defaultDailyLimit;
}

export function setDailyLimit(n) {
  const v = parseInt(n, 10);
  if (Number.isFinite(v) && v > 0) store.set(store.KEYS.dailyLimit, v);
}

export function getCap() {
  return Math.floor(getDailyLimit() * (1 - QUOTA.safetyMargin));
}

export function getUsed() {
  const q = store.getJSON(store.KEYS.quota, null);
  if (!q || q.day !== today()) return 0;
  return Number(q.count) || 0;
}

export function remaining() {
  return Math.max(0, getCap() - getUsed());
}

export function canSpend(n = 1) {
  return remaining() >= n;
}

// Вызывать прямо перед отправкой запроса. Возвращает false, если лимит исчерпан.
export function spend() {
  if (!canSpend(1)) return false;
  store.setJSON(store.KEYS.quota, { day: today(), count: getUsed() + 1 });
  return true;
}

export function onExternalChange(cb) {
  store.onChange(store.KEYS.quota, cb);
  store.onChange(store.KEYS.dailyLimit, cb);
}
