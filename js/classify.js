import { SOCIAL_DOMAINS, FREE_HOSTING_DOMAINS } from './config.js';

// Приводит то, что организация вписала в поле "сайт", к URL.
// В справочнике встречается "vk.com/club1", "www.site.ru", "http://site.ru " и т.п.
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

export function hostOf(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function matchesDomain(host, list) {
  return list.find((d) => host === d || host.endsWith('.' + d)) || null;
}

// Возвращает { status, host, href, hint }.
// status: none | social | site
export function classify(rawUrl) {
  const u = normalizeUrl(rawUrl);
  if (!u) {
    // Поле пустое или там мусор, который не похож на адрес.
    return { status: 'none', host: null, href: null, hint: rawUrl && rawUrl.trim() ? 'некорректный url' : null };
  }
  const host = hostOf(u);
  const social = matchesDomain(host, SOCIAL_DOMAINS);
  if (social) return { status: 'social', host, href: u.href, hint: social };
  const free = matchesDomain(host, FREE_HOSTING_DOMAINS);
  return { status: 'site', host, href: u.href, hint: free ? `конструктор: ${free}` : null };
}
