// Обёртка над localStorage. Здесь хранятся ТОЛЬКО настройки пользователя:
// ключи, счётчик запросов, тема, лимит. Данные API сюда не попадают никогда.

const PREFIX = 'lr.';

export const KEYS = {
  searchKey: 'key.search',
  mapKey: 'key.map',
  quota: 'quota',
  dailyLimit: 'quota.limit',
  theme: 'theme',
  source: 'source',
};

// Белый список: тест проверяет, что в localStorage нет ничего кроме этого.
export const ALLOWED_KEYS = Object.values(KEYS).map((k) => PREFIX + k);

export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* приватный режим или заблокированное хранилище: нечего удалять */
  }
}

export function getJSON(key, fallback = null) {
  const raw = get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  return set(key, JSON.stringify(value));
}

export function onChange(key, cb) {
  window.addEventListener('storage', (e) => {
    if (e.key === PREFIX + key) cb(e.newValue);
  });
}
