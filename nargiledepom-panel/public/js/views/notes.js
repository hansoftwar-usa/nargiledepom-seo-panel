import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, chip, fmtDate, fmtDateTime, openModal, confirmAction, formToObject,
  emptyState, todayIso, debounce, monthLabel, monthKeyOf,
} from '../ui.js';

const state = { q: '' };

function noteMonth(note) {
  return note.month || monthKeyOf(note.createdAt) || '';
}

export function render(container, ctx) {
  const all = ctx.data.notes || [];

  container.innerHTML = `<div class="page">
    <div class="toolbar">
      <div class="toolbar__search">
        ${icons.search}
        <input type="search" id="note-q" placeholder="Not veya etiket ara…" value="${esc(state.q)}" aria-label="Not ara" />
      </div>
      <div class="toolbar__spacer"></div>
      <button type="button" class="btn btn--primary" data-new-note>${icons.plus} Yeni not</button>
    </div>
    <div id="note-summary" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
    <div id="note-results"></div>
  </div>`;

  const results = container.querySelector('#note-results');
  const summary = container.querySelector('#note-summary');

  function paint() {
    const q = state.q.toLocaleLowerCase('tr');
    const list = all
      .filter((note) => {
        if (!q) return true;
        return [note.title, note.content, note.tag, noteMonth(note)].join(' ').toLocaleLowerCase('tr').includes(q);
      })
      .sort((a, b) => {
        const am = noteMonth(a);
        const bm = noteMonth(b);
        if (am !== bm) return String(bm).localeCompare(String(am));
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

    const latest = [...all].sort((a, b) => String(noteMonth(b)).localeCompare(String(noteMonth(a))))[0];
    summary.innerHTML = `
      ${chip(`${all.length} not`, 'gray', { sm: true, dot: false })}
      ${latest ? chip(`Son: ${noteMonth(latest) ? monthLabel(noteMonth(latest)) : '—'}`, 'amber', { sm: true, dot: false }) : ''}
      ${state.q ? chip(`${list.length} sonuç`, 'purple', { sm: true, dot: false }) : ''}`;

    if (!all.length) {
      results.innerHTML = emptyState({
        icon: 'note',
        title: 'Henüz not yok',
        text: 'Aylık SEO raporlarını, backlink stratejilerini ve yapılacakları not olarak sakla.',
        action: `<button type="button" class="btn btn--primary btn--sm" data-new-note>${icons.plus} İlk notu ekle</button>`,
      });
      results.querySelectorAll('[data-new-note]').forEach((btn) => btn.addEventListener('click', () => openForm(ctx)));
      return;
    }

    if (!list.length) {
      results.innerHTML = emptyState({
        icon: 'search',
        title: 'Sonuç bulunamadı',
        text: 'Farklı bir kelimeyle aramayı dene.',
        action: '<button type="button" class="btn btn--soft btn--sm" data-clear>Filtreyi temizle</button>',
      });
      results.querySelector('[data-clear]').addEventListener('click', () => {
        state.q = '';
        const input = container.querySelector('#note-q');
        if (input) input.value = '';
        paint();
      });
      return;
    }

    results.innerHTML = `<div class="notes-grid">${list.map((note) => {
      const month = noteMonth(note);
      const excerpt = String(note.content || '').replace(/\s+/g, ' ').slice(0, 190);
      return `<button type="button" class="note-card" data-note="${esc(note.id)}">
        <div class="note-card__top">
          <span class="note-card__month">${esc(month ? monthLabel(month) : 'Tarih yok')}</span>
          ${note.tag ? chip(note.tag, 'purple', { sm: true, dot: false }) : ''}
        </div>
        <div class="note-card__title">${esc(note.title)}</div>
        <div class="note-card__excerpt">${esc(excerpt)}${String(note.content || '').length > 190 ? '…' : ''}</div>
        <div class="note-card__foot">
          <span>${esc(fmtDate(note.updatedAt || note.createdAt, { year: false }))}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;color:var(--amber-2)">Oku ${icons.arrowRight}</span>
        </div>
      </button>`;
    }).join('')}</div>`;

    results.querySelectorAll('[data-note]').forEach((card) => {
      card.addEventListener('click', () => {
        const note = all.find((n) => n.id === card.dataset.note);
        if (note) openDetail(ctx, note);
      });
    });
  }

  const search = container.querySelector('#note-q');
  const doSearch = debounce(() => {
    state.q = search.value;
    paint();
  }, 160);
  search.addEventListener('input', doSearch);

  container.querySelector('[data-new-note]').addEventListener('click', () => openForm(ctx));

  paint();
}

export function openDetail(ctx, note) {
  const month = noteMonth(note);
  const body = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${month ? chip(monthLabel(month), 'amber', { sm: true, dot: false }) : ''}
      ${note.tag ? chip(note.tag, 'purple', { sm: true, dot: false }) : ''}
      ${chip(`Güncelleme: ${fmtDateTime(note.updatedAt || note.createdAt)}`, 'gray', { sm: true, dot: false })}
    </div>
    <div class="note-detail">${esc(note.content || 'İçerik yok.')}</div>`;

  const dialog = openModal({
    title: note.title,
    body,
    cancelText: 'Kapat',
    onSubmit: null,
    footerStart: `<div style="display:flex;gap:6px">
      <button type="button" class="btn btn--soft btn--sm" id="note-edit">${icons.edit} Düzenle</button>
      <button type="button" class="btn btn--danger btn--sm" id="note-delete">${icons.trash} Sil</button>
    </div>`,
  });

  dialog.querySelector('#note-edit').addEventListener('click', () => {
    dialog.close();
    openForm(ctx, note);
  });

  dialog.querySelector('#note-delete').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Not silinsin mi?',
      message: `"${note.title}" notu kalıcı olarak silinecek.`,
      confirmText: 'Sil',
    });
    if (!ok) return;
    try {
      await api.del(`/api/notes/${note.id}`);
      dialog.close();
      ctx.toast('Not silindi.');
      await ctx.refresh();
    } catch (err) {
      ctx.toast(err.message || 'Silinemedi.', 'error');
    }
  });
}

export function openForm(ctx, item = null) {
  const editing = Boolean(item);
  const n = item || {};
  const value = (v) => esc(v === null || v === undefined ? '' : v);

  const body = `<div class="form-grid">
    <div class="field span-2">
      <label for="n-title">Not başlığı *</label>
      <input type="text" id="n-title" name="title" value="${value(n.title)}" placeholder="Örn. Ekim ayı SEO raporu" required />
    </div>
    <div class="field">
      <label for="n-month">Ay</label>
      <input type="month" id="n-month" name="month" value="${value(n.month || todayIso().slice(0, 7))}" />
    </div>
    <div class="field">
      <label for="n-tag">Etiket</label>
      <input type="text" id="n-tag" name="tag" value="${value(n.tag)}" placeholder="Rapor / Strateji / Plan" />
    </div>
    <div class="field span-2">
      <label for="n-content">İçerik</label>
      <textarea id="n-content" name="content" style="min-height:180px" placeholder="Backlink çalışmaları, sıralama değişimleri, yapılacaklar…">${value(n.content)}</textarea>
    </div>
  </div>`;

  openModal({
    title: editing ? 'Notu düzenle' : 'Yeni not',
    body,
    submitText: editing ? 'Güncelle' : 'Kaydet',
    onSubmit: async (formData) => {
      const values = formToObject(formData);
      if (!values.title) throw new Error('Not başlığı girin.');
      if (editing) {
        await api.put(`/api/notes/${item.id}`, values);
      } else {
        await api.post('/api/notes', values);
      }
      ctx.toast(editing ? 'Not güncellendi.' : 'Not eklendi.');
      await ctx.refresh();
    },
  });
}
