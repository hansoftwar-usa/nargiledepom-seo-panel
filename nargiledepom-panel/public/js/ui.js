import { icons } from './icons.js';
import { MONTHS_LONG, MONTHS_SHORT } from './constants.js';

/* ---------------- DOM / metin ---------------- */

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function debounce(fn, wait = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function chip(label, tone = 'gray', { sm = false, dot = true } = {}) {
  return `<span class="chip tone-${esc(tone)}${sm ? ' chip--sm' : ''}">${dot ? '<span class="chip__dot"></span>' : ''}${esc(label)}</span>`;
}

export function emptyState({ icon = 'file', title = 'Kayıt yok', text = '', action = '' } = {}) {
  return `<div class="empty">
    <div class="empty__icon">${icons[icon] || icons.file}</div>
    <div class="empty__title">${esc(title)}</div>
    ${text ? `<div class="empty__text">${esc(text)}</div>` : ''}
    ${action}
  </div>`;
}

/* ---------------- Sayı / tarih biçimleri ---------------- */

const trNumber = new Intl.NumberFormat('tr-TR');

export function fmtNum(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? trNumber.format(n) : '—';
}

export function fmtMoney(value, currency = 'TRY') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch (_) {
    return `${fmtNum(n)} ${currency}`;
  }
}

function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value, { year = true, long = false } = {}) {
  const d = parseDate(value);
  if (!d) return '—';
  const opts = { day: '2-digit', month: long ? 'long' : 'short' };
  if (year) opts.year = 'numeric';
  return new Intl.DateTimeFormat('tr-TR', opts).format(d);
}

export function fmtDateTime(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function relTime(value) {
  const d = parseDate(value);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return fmtDate(d);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'dün';
  if (days < 30) return `${days} gün önce`;
  return fmtDate(d);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toInputDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = parseDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysFromToday(value) {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
}

export function monthKeyOf(value) {
  const d = parseDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthShort(key) {
  if (!/^\d{4}-\d{2}$/.test(key || '')) return '';
  return MONTHS_SHORT[Number(key.slice(5, 7)) - 1] || '';
}

export function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(key || '')) return '';
  return `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/* ---------------- Toast ---------------- */

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${type === 'error' ? icons.alert : icons.check}<span>${esc(message)}</span>`;
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

/* ---------------- Modal ---------------- */

export function openModal({
  title,
  body = '',
  submitText = 'Kaydet',
  cancelText = 'Kapat',
  onSubmit = null,
  danger = false,
  size = '',
  footerStart = '',
} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal${size === 'sm' ? ' modal--sm' : ''}`;
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `
    <form class="modal__form" novalidate>
      <div class="modal__head">
        <h2 class="modal__title">${esc(title)}</h2>
        <button type="button" class="icon-btn icon-btn--sm" data-close aria-label="Kapat">${icons.x}</button>
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__foot">
        <div style="margin-right:auto">${footerStart}</div>
        <button type="button" class="btn btn--ghost" data-close>${esc(cancelText)}</button>
        ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitText)}</button>` : ''}
      </div>
    </form>`;

  const form = dialog.querySelector('form');
  const submitBtn = form.querySelector('button[type="submit"]');
  let busy = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit || busy) return;
    busy = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await onSubmit(new FormData(form), form, dialog);
      if (result !== false) dialog.close();
    } catch (err) {
      toast(err && err.message ? err.message : 'İşlem tamamlanamadı.', 'error');
    } finally {
      busy = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // Bazi gomulu tarayicilar close olayini gecirmiyor; kapatma her durumda calissin.
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    dialog.remove();
    dialog.dispatchEvent(new Event('close'));
  };
  const nativeClose = dialog.close.bind(dialog);
  dialog.close = (...args) => {
    const wasOpen = dialog.open;
    nativeClose(...args);
    if (wasOpen) setTimeout(cleanup, 0);
  };
  dialog.addEventListener('close', cleanup);
  dialog.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => dialog.close());
  });

  document.body.append(dialog);
  dialog.showModal();

  if (window.innerWidth >= 700) {
    const first = dialog.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }

  return dialog;
}

export function confirmAction({
  title = 'Emin misiniz?',
  message = '',
  confirmText = 'Sil',
  cancelText = 'Vazgeç',
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const dialog = openModal({
      title,
      size: 'sm',
      body: `<p class="modal-sub" style="margin:0">${esc(message)}</p>`,
      submitText: confirmText,
      cancelText,
      danger,
      onSubmit: () => {
        settled = true;
        resolve(true);
        return true;
      },
    });
    dialog.addEventListener('close', () => {
      if (!settled) resolve(false);
    });
  });
}

export function formToObject(formData) {
  const out = {};
  for (const [key, value] of formData.entries()) {
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

/* ---------------- Küçük yardımcılar ---------------- */

export function initials(value) {
  const clean = String(value || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  const ch = clean.match(/[a-z0-9çğıöşü]/i);
  return (ch ? ch[0] : '?').toUpperCase();
}

export function ensureUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

export function domainOf(value, fallback = '') {
  const v = String(value || '').trim();
  if (!v) return fallback;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.hostname.replace(/^www\./, '');
  } catch (_) {
    return v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || fallback;
  }
}

export function truncate(value, max = 60) {
  const s = String(value || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function moveChip(diff) {
  if (diff === null || diff === undefined) return '<span class="delta delta--flat">—</span>';
  if (diff > 0) return `<span class="delta delta--up">↑ ${diff}</span>`;
  if (diff < 0) return `<span class="delta delta--down">↓ ${Math.abs(diff)}</span>`;
  return '<span class="delta delta--flat">—</span>';
}

export function rankTone(position) {
  if (!position) return 'low';
  if (position <= 3) return 'top';
  if (position <= 10) return 'good';
  return 'low';
}
