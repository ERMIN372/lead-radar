// Таблица результатов. Всё, что пришло из API, вставляем только через
// textContent и проверенные href: названия организаций могут содержать что угодно.

import { STATUS } from './config.js';

const tbody = () => document.getElementById('results-body');

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  if (text !== undefined) n.textContent = text;
  return n;
}

function telHref(phone) {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

// Содержимое ячейки всегда в одном блоке: на телефоне td становится сеткой
// "подпись | значение", и несколько детей разъехались бы по колонкам.
function cell(label, ...children) {
  const td = el('td', { 'data-label': label });
  const body = el('div', { class: 'cell' });
  for (const c of children) if (c) body.append(c);
  td.append(body);
  td.body = body;
  return td;
}

function renderRow(item, index, cls, handlers) {
  const status = STATUS[cls.status];
  const tr = el('tr', { dataset: { uid: item.uid, status: cls.status }, tabindex: '0' });

  tr.append(el('td', { class: 'col-n', 'data-label': '№' }, String(index + 1)));

  const badge = el('span', { class: `badge badge-${cls.status}` }, status.label);
  badge.style.setProperty('--c', status.color);
  const statusTd = cell('Статус', badge);
  if (cls.hint) statusTd.body.append(el('div', { class: 'muted small' }, cls.hint));
  if (item.audit) statusTd.body.append(el('div', { class: 'muted small' }, `устарелость ${item.audit.score}/100`));
  tr.append(statusTd);

  const nameTd = cell('Название', el('div', { class: 'name' }, item.name));
  if (item.category) nameTd.body.append(el('div', { class: 'muted small' }, item.category));
  if (item.hours) nameTd.body.append(el('div', { class: 'muted small' }, item.hours));
  tr.append(nameTd);

  tr.append(cell('Адрес', document.createTextNode(item.address || '—')));

  const phonesTd = cell('Телефон');
  if (item.phones.length) {
    for (const p of item.phones) {
      const href = telHref(p);
      phonesTd.body.append(href ? el('a', { href, class: 'phone' }, p) : el('span', {}, p));
    }
  } else {
    phonesTd.body.append(el('span', { class: 'muted' }, 'нет'));
  }
  tr.append(phonesTd);

  const siteTd = cell('Сайт');
  if (cls.href) {
    siteTd.body.append(el('a', { href: cls.href, target: '_blank', rel: 'noopener noreferrer nofollow', class: 'site' }, cls.host));
  } else if (item.url) {
    siteTd.body.append(el('span', { class: 'muted' }, item.url));
  } else {
    siteTd.body.append(el('span', { class: 'muted' }, '—'));
  }
  tr.append(siteTd);

  const actions = el('div', { class: 'row-actions' });
  const copyBtn = el('button', { type: 'button', class: 'btn btn-sm', title: 'Скопировать название, адрес, телефон и ссылки' }, 'Скопировать');
  copyBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onCopy(item, cls); });
  actions.append(copyBtn);
  if (item.cardUrl) {
    actions.append(el('a', { href: item.cardUrl, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-ghost' }, item.cardLabel));
  }
  if (handlers.onAudit && cls.status === 'site') {
    const auditBtn = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, 'Проверить сайт');
    auditBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onAudit(item); });
    actions.append(auditBtn);
  }
  tr.append(cell('Действия', actions));

  tr.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    handlers.onFocus(item.uid);
  });
  tr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === tr) handlers.onFocus(item.uid);
  });
  return tr;
}

export function render(items, classOf, handlers) {
  const body = tbody();
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => frag.append(renderRow(item, i, classOf(item), handlers)));
  body.replaceChildren(frag);
}

export function setDimmed(dimmedUids) {
  for (const tr of tbody().children) tr.classList.toggle('dimmed', dimmedUids.has(tr.dataset.uid));
}

export function highlight(uid, scroll = true) {
  for (const tr of tbody().children) {
    const on = tr.dataset.uid === uid;
    tr.classList.toggle('active', on);
    if (on && scroll) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
