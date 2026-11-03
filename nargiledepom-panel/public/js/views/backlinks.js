import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, chip, fmtDate, fmtMoney, fmtNum, openModal, confirmAction, formToObject,
  emptyState, initials, domainOf, ensureUrl, todayIso, debounce, truncate,
} from '../ui.js';
import { BACKLINK_TYPES, BACKLINK_STATUS, INDEX_STATUS, CURRENCIES } from '../constants.js';

const PAGE_SIZE = 20;
const state = { q: '', status: '', type: '', sort: 'new', page: 1 };

function typeLabel(key) {
  return BACKLINK_TYPES[key] || 'Diğer';
}

function linkName(item) {
  return item.site || domainOf(item.url, '—');
}

function sortValue(item) {
  if (state.sort === 'dr') return item.dr === null || item.dr === undefined ? -1 : Number(item.dr);
  if (state.sort === 'price') return item.price === null || item.price === undefined ? -1 : Number(item.price);
  if (state.sort === 'date') return item.publishDate || String(item.createdAt || '').slice(0, 10);
  return item.createdAt || item.publishDate || '';
}

function statusChip(status) {
  const info = BACKLINK_STATUS[status] || BACKLINK_STATUS.yayinda;
  return chip(info.label, info.tone, { sm: true });
}

function indexChip(status) {
  const info = INDEX_STATUS[status] || INDEX_STATUS.bilinmiyor;
  return chip(info.label, info.tone, { sm: true });
}

function priceCell(item) {
  if (item.price === null || item.price === undefined || item.price === '') {
    return '<span class="text-muted">—</span>';
  }
  if (Number(item.price) === 0) return '<span class="text-muted">Ücretsiz</span>';
  return esc(fmtMoney(item.price, item.currency || 'TRY'));
}

function optionsFrom(map, selected) {
  return Object.entries(map).map(([value, info]) => {
    const label = typeof info === 'string' ? info : info.label;
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export function render(container, ctx) {
  const all = ctx.data.backlinks || [];

  container.innerHTML = `<div class="page">
    <div class="toolbar">
      <div class="toolbar__search">
        ${icons.search}
        <input type="search" id="bl-q" placeholder="Site, anchor, URL veya not ara…" value="${esc(state.q)}" aria-label="Backlink ara" />
      </div>
      <select id="bl-status" aria-label="Durum filtresi">
        <option value="">Tüm durumlar</option>
        ${optionsFrom(BACKLINK_STATUS, state.status)}
      </select>
      <select id="bl-type" aria-label="Tür filtresi">
        <option value="">Tüm türler</option>
        ${optionsFrom(BACKLINK_TYPES, state.type)}
      </select>
      <select id="bl-sort" aria-label="Sıralama">
        <option value="new"${state.sort === 'new' ? ' selected' : ''}>En yeni</option>
        <option value="dr"${state.sort === 'dr' ? ' selected' : ''}>DR (yüksek)</option>
        <option value="price"${state.sort === 'price' ? ' selected' : ''}>Fiyat (yüksek)</option>
        <option value="date"${state.sort === 'date' ? ' selected' : ''}>Yayın tarihi</option>
      </select>
      <div class="toolbar__spacer"></div>
      <a class="btn btn--ghost" href="/api/export/backlinks.csv" download>${icons.download} CSV</a>
      <button type="button" class="btn btn--primary" data-new-backlink>${icons.plus} Yeni backlink</button>
    </div>
    <div id="bl-summary" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
    <div id="bl-results"></div>
  </div>`;

  const results = container.querySelector('#bl-results');
  const summary = container.querySelector('#bl-summary');

  function filtered() {
    const q = state.q.toLocaleLowerCase('tr');
    return all
      .filter((item) => {
        if (state.status && item.status !== state.status) return false;
        if (state.type && item.type !== state.type) return false;
        if (!q) return true;
        const haystack = [item.site, item.url, item.anchor, item.targetPage, item.notes, item.contact]
          .join(' ').toLocaleLowerCase('tr');
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        if (typeof av === 'number' || typeof bv === 'number') return Number(bv) - Number(av);
        return String(bv).localeCompare(String(av));
      });
  }

  function rowsHtml(list) {
    return list.map((b) => {
      const name = linkName(b);
      const href = b.url ? ensureUrl(b.url) : '';
      const dr = b.dr === null || b.dr === undefined ? '—' : fmtNum(b.dr);
      const da = b.da === null || b.da === undefined ? '—' : fmtNum(b.da);
      const date = b.publishDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : '');
      const target = b.targetPage || '—';
      const anchor = b.anchor || '—';

      return `<tr>
        <td>
          <div class="domain">
            <div class="domain__avatar">${esc(initials(name))}</div>
            <div style="min-width:0">
              <span class="domain__name" title="${esc(name)}">${esc(name)}</span>
              ${href
                ? `<a class="domain__sub" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(b.url)}">${esc(domainOf(b.url, b.url))}</a>`
                : `<span class="domain__sub">${esc(target)}</span>`}
            </div>
          </div>
        </td>
        <td>${chip(typeLabel(b.type), 'gray', { sm: true, dot: false })}</td>
        <td>
          <div style="display:grid;gap:3px;justify-items:start">
            ${statusChip(b.status)}
            ${indexChip(b.indexStatus)}
          </div>
        </td>
        <td class="nowrap">
          <span class="rank-pill" title="Domain Rating">${dr}</span>
          <span class="rank-pill" title="Domain Authority">${da}</span>
        </td>
        <td class="muted" style="max-width:190px"><span title="${esc(anchor)}">${esc(truncate(anchor, 32))}</span></td>
        <td class="price">${priceCell(b)}</td>
        <td class="muted nowrap">${date ? esc(fmtDate(date)) : '—'}</td>
        <td>
          <div class="row-actions">
            ${href ? `<a class="icon-btn icon-btn--sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Siteyi aç">${icons.external}</a>` : ''}
            <button type="button" class="icon-btn icon-btn--sm" data-edit="${esc(b.id)}" title="Düzenle">${icons.edit}</button>
            <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${esc(b.id)}" title="Sil">${icons.trash}</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function cardsHtml(list) {
    return `<div class="bl-cards">${list.map((b) => {
      const name = linkName(b);
      const href = b.url ? ensureUrl(b.url) : '';
      const date = b.publishDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : '');
      return `<article class="bl-card">
        <div class="bl-card__top">
          <div class="domain">
            <div class="domain__avatar">${esc(initials(name))}</div>
            <div style="min-width:0">
              <span class="domain__name">${esc(name)}</span>
              ${href
                ? `<a class="domain__sub" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(b.url, b.url))}</a>`
                : `<span class="domain__sub">${esc(b.targetPage || '—')}</span>`}
            </div>
          </div>
          <div style="display:grid;gap:3px;justify-items:end">
            ${statusChip(b.status)}
            ${indexChip(b.indexStatus)}
          </div>
        </div>
        <div class="bl-card__meta">
          ${chip(typeLabel(b.type), 'gray', { sm: true, dot: false })}
          ${b.anchor ? `<span class="text-muted" style="font-size:11.5px">Anchor: ${esc(truncate(b.anchor, 34))}</span>` : ''}
        </div>
        <div class="bl-card__foot">
          <div class="bl-card__stats">
            <div class="stat-mini"><span>DR / DA</span><strong>${b.dr ?? '—'} / ${b.da ?? '—'}</strong></div>
            <div class="stat-mini"><span>Fiyat</span><strong>${priceCell(b)}</strong></div>
            <div class="stat-mini"><span>Tarih</span><strong>${date ? esc(fmtDate(date, { year: false })) : '—'}</strong></div>
          </div>
          <div class="row-actions">
            ${href ? `<a class="icon-btn icon-btn--sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Siteyi aç">${icons.external}</a>` : ''}
            <button type="button" class="icon-btn icon-btn--sm" data-edit="${esc(b.id)}" aria-label="Düzenle">${icons.edit}</button>
            <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${esc(b.id)}" aria-label="Sil">${icons.trash}</button>
          </div>
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  function paint() {
    const list = filtered();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    const active = all.filter((b) => b.status === 'yayinda').length;
    const planned = all.filter((b) => b.status === 'planlandi').length;
    const month = todayIso().slice(0, 7);
    const thisMonth = all.filter((b) => String(b.publishDate || b.createdAt || '').slice(0, 7) === month).length;

    summary.innerHTML = `
      ${chip(`${fmtNum(all.length)} kayıt`, 'gray', { sm: true, dot: false })}
      ${chip(`${fmtNum(active)} yayında`, 'green', { sm: true, dot: false })}
      ${chip(`${fmtNum(planned)} planlı`, 'amber', { sm: true, dot: false })}
      ${chip(`Bu ay ${fmtNum(thisMonth)}`, 'blue', { sm: true, dot: false })}
      ${state.q || state.status || state.type ? chip(`${fmtNum(list.length)} sonuç`, 'purple', { sm: true, dot: false }) : ''}`;

    if (!all.length) {
      results.innerHTML = emptyState({
        icon: 'link',
        title: 'Henüz backlink yok',
        text: 'İlk backlink kaydını ekleyerek site, anchor, DR/DA ve fiyat bilgilerini takip et.',
        action: `<button type="button" class="btn btn--primary btn--sm" data-new-backlink>${icons.plus} İlk backlinki ekle</button>`,
      });
      wireResults();
      return;
    }

    if (!list.length) {
      results.innerHTML = emptyState({
        icon: 'search',
        title: 'Sonuç bulunamadı',
        text: 'Arama veya filtreleri değiştirerek tekrar dene.',
        action: '<button type="button" class="btn btn--soft btn--sm" data-clear-filters>Filtreleri temizle</button>',
      });
      wireResults();
      return;
    }

    results.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Site</th>
            <th>Tür</th>
            <th>Durum</th>
            <th>DR / DA</th>
            <th>Anchor</th>
            <th>Fiyat</th>
            <th>Tarih</th>
            <th style="text-align:right">İşlem</th>
          </tr></thead>
          <tbody>${rowsHtml(pageItems)}</tbody>
        </table>
      </div>
      ${cardsHtml(pageItems)}
      <div class="pagination">
        <span>${start + 1}–${Math.min(start + PAGE_SIZE, list.length)} / ${fmtNum(list.length)} kayıt</span>
        <div class="pagination__buttons">
          <button type="button" class="btn btn--ghost btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>${icons.chevronLeft} Önceki</button>
          <button type="button" class="btn btn--ghost btn--sm" data-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''}>Sonraki ${icons.chevronRight}</button>
        </div>
      </div>`;

    wireResults();
  }

  function wireResults() {
    results.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = all.find((b) => b.id === btn.dataset.edit);
        if (item) openForm(ctx, item);
      });
    });

    results.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = all.find((b) => b.id === btn.dataset.delete);
        if (!item) return;
        const ok = await confirmAction({
          title: 'Backlink silinsin mi?',
          message: `${linkName(item)} kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
          confirmText: 'Sil',
        });
        if (!ok) return;
        try {
          await api.del(`/api/backlinks/${item.id}`);
          ctx.toast('Backlink silindi.');
          await ctx.refresh();
        } catch (err) {
          ctx.toast(err.message || 'Silinemedi.', 'error');
        }
      });
    });

    results.querySelectorAll('[data-new-backlink]').forEach((btn) => {
      btn.addEventListener('click', () => openForm(ctx));
    });

    results.querySelectorAll('[data-clear-filters]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.q = '';
        state.status = '';
        state.type = '';
        state.page = 1;
        const search = container.querySelector('#bl-q');
        if (search) search.value = '';
        const status = container.querySelector('#bl-status');
        if (status) status.value = '';
        const type = container.querySelector('#bl-type');
        if (type) type.value = '';
        paint();
      });
    });

    results.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.page = Number(btn.dataset.page) || 1;
        paint();
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  container.querySelector('[data-new-backlink]').addEventListener('click', () => openForm(ctx));

  const search = container.querySelector('#bl-q');
  const doSearch = debounce(() => {
    state.q = search.value;
    state.page = 1;
    paint();
  }, 160);
  search.addEventListener('input', doSearch);

  container.querySelector('#bl-status').addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    paint();
  });
  container.querySelector('#bl-type').addEventListener('change', (event) => {
    state.type = event.target.value;
    state.page = 1;
    paint();
  });
  container.querySelector('#bl-sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.page = 1;
    paint();
  });

  paint();
}

export function openForm(ctx, item = null) {
  const editing = Boolean(item);
  const b = item || {};
  const value = (v) => esc(v === null || v === undefined ? '' : v);

  const body = `<div class="form-grid">
    <div class="field">
      <label for="f-site">Site adı</label>
      <input type="text" id="f-site" name="site" value="${value(b.site)}" placeholder="ornekblog.com" />
      <span class="field__hint">Site adı veya URL'den en az biri gerekli.</span>
    </div>
    <div class="field">
      <label for="f-url">Backlink URL</label>
      <input type="url" id="f-url" name="url" value="${value(b.url)}" placeholder="https://ornekblog.com/yazi" />
    </div>
    <div class="field">
      <label for="f-type">Tür</label>
      <select id="f-type" name="type">${optionsFrom(BACKLINK_TYPES, b.type || 'blog')}</select>
    </div>
    <div class="field">
      <label for="f-status">Durum</label>
      <select id="f-status" name="status">${optionsFrom(BACKLINK_STATUS, b.status || 'yayinda')}</select>
    </div>
    <div class="field">
      <label for="f-index">Index durumu</label>
      <select id="f-index" name="indexStatus">${optionsFrom(INDEX_STATUS, b.indexStatus || 'bilinmiyor')}</select>
    </div>
    <div class="field">
      <label for="f-target">Hedef sayfa</label>
      <input type="text" id="f-target" name="targetPage" value="${value(b.targetPage)}" placeholder="/nargile-takimlari" />
    </div>
    <div class="field">
      <label for="f-anchor">Anchor text</label>
      <input type="text" id="f-anchor" name="anchor" value="${value(b.anchor)}" placeholder="nargile takımı" />
    </div>
    <div class="field">
      <label for="f-dr">DR</label>
      <input type="number" id="f-dr" name="dr" value="${value(b.dr)}" min="0" max="100" placeholder="0–100" />
    </div>
    <div class="field">
      <label for="f-da">DA</label>
      <input type="number" id="f-da" name="da" value="${value(b.da)}" min="0" max="100" placeholder="0–100" />
    </div>
    <div class="field">
      <label for="f-price">Fiyat</label>
      <input type="number" id="f-price" name="price" value="${value(b.price)}" min="0" step="0.01" placeholder="0" />
    </div>
    <div class="field">
      <label for="f-currency">Para birimi</label>
      <select id="f-currency" name="currency">
        ${CURRENCIES.map((c) => `<option value="${c}"${(b.currency || 'TRY') === c ? ' selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="f-publish">Yayın tarihi</label>
      <input type="date" id="f-publish" name="publishDate" value="${value(b.publishDate)}" />
    </div>
    <div class="field">
      <label for="f-expiry">Bitiş tarihi</label>
      <input type="date" id="f-expiry" name="expiryDate" value="${value(b.expiryDate)}" />
    </div>
    <div class="field">
      <label for="f-contact">İletişim</label>
      <input type="text" id="f-contact" name="contact" value="${value(b.contact)}" placeholder="E-posta / kişi" />
    </div>
    <div class="field span-2">
      <label for="f-notes">Notlar</label>
      <textarea id="f-notes" name="notes" placeholder="Anlaşma detayı, yazı konusu, takip notu…">${value(b.notes)}</textarea>
    </div>
  </div>`;

  openModal({
    title: editing ? 'Backlinki düzenle' : 'Yeni backlink',
    body,
    submitText: editing ? 'Güncelle' : 'Kaydet',
    onSubmit: async (formData) => {
      const values = formToObject(formData);
      if (!values.site && !values.url) {
        throw new Error('Site adı veya backlink URL girin.');
      }
      if (editing) {
        await api.put(`/api/backlinks/${item.id}`, values);
      } else {
        await api.post('/api/backlinks', values);
      }
      ctx.toast(editing ? 'Backlink güncellendi.' : 'Backlink eklendi.');
      await ctx.refresh();
    },
  });
}
