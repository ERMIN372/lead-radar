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

// Декодер punycode (RFC 3492) для показа: URL() превращает "топган.рф"
// в "xn--80af5abfq.xn--p1ai", а человеку нужна кириллица.
function decodeLabel(label) {
  if (!label.startsWith('xn--')) return label;
  const input = label.slice(4);
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const adapt = (delta, num, first) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / num);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  const digit = (c) => (c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : base);
  const sep = input.lastIndexOf('-');
  const out = sep > 0 ? [...input.slice(0, sep)].map((ch) => ch.codePointAt(0)) : [];
  let n = 128, bias = 72, i = 0;
  for (let pos = sep > 0 ? sep + 1 : 0; pos < input.length;) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (pos >= input.length) return label;
      const d = digit(input.charCodeAt(pos++));
      if (d >= base) return label;
      i += d * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (d < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1));
    i %= out.length + 1;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

export function displayHost(host) {
  try {
    return host.split('.').map(decodeLabel).join('.');
  } catch {
    return host;
  }
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
