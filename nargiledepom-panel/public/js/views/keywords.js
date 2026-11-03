import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, chip, fmtDate, fmtNum, openModal, confirmAction, formToObject,
  emptyState, moveChip, todayIso, debounce, truncate, monthLabel,
} from '../ui.js';
import { sparkline } from '../charts.js';

const state = { q: '', sort: 'rank' };

function sortedPositions(keyword) {
  return [...(keyword.positions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function statsOf(keyword) {
  const list = sortedPositions(keyword);
  const last = list.length ? list[list.length - 1] : null;
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const best = list.length ? Math.min(...list.map((p) => Number(p.position))) : null;
  const change = last && prev ? Number(prev.position) - Number(last.position) : null;
  return { list, last, prev, best, change };
}

function rankClass(position) {
  if (!position) return 'low';
  if (position <= 3) return 'top';
  if (position <= 10) return 'good';
  return 'low';
}

export function render(container, ctx) {
  const all = ctx.data.keywords || [];

  container.innerHTML = `<div class="page">
    <div class="toolbar">
      <div class="toolbar__search">
        ${icons.search}
        <input type="search" id="kw-q" placeholder="Anahtar kelime, grup veya hedef URL ara…" value="${esc(state.q)}" aria-label="Anahtar kelime ara" />
      </div>
      <select id="kw-sort" aria-label="Sıralama ölçütü">
        <option value="rank"${state.sort === 'rank' ? ' selected' : ''}>Sıralamaya göre</option>
        <option value="movement"${state.sort === 'movement' ? ' selected' : ''}>En çok yükselen</option>
        <option value="volume"${state.sort === 'volume' ? ' selected' : ''}>Arama hacmi</option>
        <option value="name"${state.sort === 'name' ? ' selected' : ''}>İsme göre</option>
      </select>
      <div class="toolbar__spacer"></div>
      <a class="btn btn--ghost" href="/api/export/keywords.csv" download>${icons.download} CSV</a>
      <button type="button" class="btn btn--primary" data-new-keyword>${icons.plus} Yeni kelime</button>
    </div>
    <div id="kw-summary" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
    <div id="kw-results"></div>
  </div>`;

  const results = container.querySelector('#kw-results');
  const summary = container.querySelector('#kw-summary');

  function filtered() {
    const q = state.q.toLocaleLowerCase('tr');
    const list = all.filter((k) => {
      if (!q) return true;
      return [k.keyword, k.group, k.targetUrl].join(' ').toLocaleLowerCase('tr').includes(q);
    });

    return list.sort((a, b) => {
      const sa = statsOf(a);
      const sb = statsOf(b);
      if (state.sort === 'volume') return (Number(b.volume) || 0) - (Number(a.volume) || 0);
      if (state.sort === 'name') return String(a.keyword).localeCompare(String(b.keyword), 'tr');
      if (state.sort === 'movement') return (sb.change ?? -999) - (sa.change ?? -999);
      return (sa.last?.position ?? 9999) - (sb.last?.position ?? 9999);
    });
  }

  function paint() {
    const list = filtered();

    const tracked = all.map(statsOf).filter((s) => s.last);
    const top3 = tracked.filter((s) => s.last.position <= 3).length;
    const top10 = tracked.filter((s) => s.last.position <= 10).length;
    const avg = tracked.length
      ? (tracked.reduce((sum, s) => sum + Number(s.last.position), 0) / tracked.length).toFixed(1).replace('.', ',')
      : '—';
    const improved = tracked.filter((s) => s.change !== null && s.change > 0).length;

    summary.innerHTML = `
      ${chip(`${fmtNum(all.length)} kelime`, 'gray', { sm: true, dot: false })}
      ${chip(`${top3} ilk 3'te`, 'green', { sm: true, dot: false })}
      ${chip(`${top10} ilk 10'da`, 'amber', { sm: true, dot: false })}
      ${chip(`Ort. ${avg}. sıra`, 'blue', { sm: true, dot: false })}
      ${improved ? chip(`${improved} yükselişte`, 'teal', { sm: true, dot: false }) : ''}`;

    if (!all.length) {
      results.innerHTML = emptyState({
        icon: 'trending',
        title: 'Henüz anahtar kelime yok',
        text: 'Takip etmek istediğin kelimeleri ekle, her ölçümde sıralamayı kaydet. Grafik otomatik oluşur.',
        action: `<button type="button" class="btn btn--primary btn--sm" data-new-keyword>${icons.plus} İlk kelimeyi ekle</button>`,
      });
      results.querySelectorAll('[data-new-keyword]').forEach((btn) => btn.addEventListener('click', () => openForm(ctx)));
      return;
    }

    if (!list.length) {
      results.innerHTML = emptyState({
        icon: 'search',
        title: 'Sonuç bulunamadı',
        text: 'Arama kelimesini değiştirerek tekrar dene.',
        action: '<button type="button" class="btn btn--soft btn--sm" data-clear>Filtreyi temizle</button>',
      });
      results.querySelector('[data-clear]').addEventListener('click', () => {
        state.q = '';
        const input = container.querySelector('#kw-q');
        if (input) input.value = '';
        paint();
      });
      return;
    }

    results.innerHTML = `<div class="kw-grid">${list.map(cardHtml).join('')}</div>`;
    wireCards();
  }

  function cardHtml(keyword) {
    const { list, last, best, change } = statsOf(keyword);
    const position = last ? Number(last.position) : null;
    const color = change === null ? '#f4b64a' : change > 0 ? '#5dd39e' : change < 0 ? '#f87171' : '#98a1b5';
    const volumeText = keyword.volume ? `${fmtNum(keyword.volume)}/ay` : 'Hacim yok';
    const group = keyword.group ? chip(keyword.group, 'purple', { sm: true, dot: false }) : '';

    return `<article class="kw-card">
      <div class="kw-card__head">
        <div style="min-width:0">
          <div class="kw-name">${esc(keyword.keyword)}</div>
          <div class="kw-sub">${esc(volumeText)}${keyword.difficulty !== null && keyword.difficulty !== undefined ? ` · zorluk ${fmtNum(keyword.difficulty)}` : ''}${keyword.targetUrl ? ` · ${esc(truncate(keyword.targetUrl, 30))}` : ''}</div>
          ${group ? `<div style="margin-top:6px">${group}</div>` : ''}
        </div>
        <div class="kw-rank">
          <div class="rank-big rank-big--${rankClass(position)}">${position === null ? '—' : fmtNum(position)}${position === null ? '' : '<small>.sıra</small>'}</div>
          <div style="margin-top:2px">${moveChip(change)}</div>
        </div>
      </div>

      ${list.length
        ? sparkline(list.map((p) => p.position), { invert: true, color, height: 40 })
        : '<div class="kw-spark" style="display:grid;place-items:center;border:1px dashed var(--line);border-radius:10px;color:var(--muted-2);font-size:11px">Henüz ölçüm yok</div>'}

      <div class="kw-foot">
        <div class="kw-stats">
          <div class="stat-mini"><span>En iyi</span><strong>${best === null ? '—' : `${fmtNum(best)}.`}</strong></div>
          <div class="stat-mini"><span>Ölçüm</span><strong>${list.length}</strong></div>
          <div class="stat-mini"><span>Son</span><strong>${last ? esc(fmtDate(last.date, { year: false })) : '—'}</strong></div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn--soft btn--sm" data-position="${esc(keyword.id)}" title="Sıralama ekle">${icons.plus} Sıralama</button>
          <button type="button" class="icon-btn icon-btn--sm" data-history="${esc(keyword.id)}" title="Geçmiş">${icons.history}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-edit="${esc(keyword.id)}" title="Düzenle">${icons.edit}</button>
          <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${esc(keyword.id)}" title="Sil">${icons.trash}</button>
        </div>
      </div>
    </article>`;
  }

  function wireCards() {
    results.querySelectorAll('[data-position]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const keyword = all.find((k) => k.id === btn.dataset.position);
        if (keyword) openPositionForm(ctx, keyword);
      });
    });
    results.querySelectorAll('[data-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const keyword = all.find((k) => k.id === btn.dataset.history);
        if (keyword) openHistory(ctx, keyword);
      });
    });
    results.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const keyword = all.find((k) => k.id === btn.dataset.edit);
        if (keyword) openForm(ctx, keyword);
      });
    });
    results.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const keyword = all.find((k) => k.id === btn.dataset.delete);
        if (!keyword) return;
        const ok = await confirmAction({
          title: 'Kelime silinsin mi?',
          message: `"${keyword.keyword}" ve tüm sıralama geçmişi kalıcı olarak silinecek.`,
          confirmText: 'Sil',
        });
        if (!ok) return;
        try {
          await api.del(`/api/keywords/${keyword.id}`);
          ctx.toast('Anahtar kelime silindi.');
          await ctx.refresh();
        } catch (err) {
          ctx.toast(err.message || 'Silinemedi.', 'error');
        }
      });
    });
  }

  const search = container.querySelector('#kw-q');
  const doSearch = debounce(() => {
    state.q = search.value;
    paint();
  }, 160);
  search.addEventListener('input', doSearch);

  container.querySelector('#kw-sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    paint();
  });

  container.querySelector('[data-new-keyword]').addEventListener('click', () => openForm(ctx));

  paint();
}

export function openForm(ctx, item = null) {
  const editing = Boolean(item);
  const k = item || {};
  const value = (v) => esc(v === null || v === undefined ? '' : v);

  const body = `<div class="form-grid">
    <div class="field span-2">
      <label for="k-keyword">Anahtar kelime *</label>
      <input type="text" id="k-keyword" name="keyword" value="${value(k.keyword)}" placeholder="nargile takımı" required />
    </div>
    <div class="field">
      <label for="k-volume">Aylık arama hacmi</label>
      <input type="number" id="k-volume" name="volume" value="${value(k.volume)}" min="0" placeholder="1300" />
    </div>
    <div class="field">
      <label for="k-difficulty">Zorluk (0–100)</label>
      <input type="number" id="k-difficulty" name="difficulty" value="${value(k.difficulty)}" min="0" max="100" placeholder="42" />
    </div>
    <div class="field">
      <label for="k-target">Hedef URL</label>
      <input type="text" id="k-target" name="targetUrl" value="${value(k.targetUrl)}" placeholder="/nargile-takimlari" />
    </div>
    <div class="field">
      <label for="k-group">Grup</label>
      <input type="text" id="k-group" name="group" value="${value(k.group)}" placeholder="Ürün / Kategori / Blog" />
    </div>
    ${editing ? '' : `
    <div class="field">
      <label for="k-position">İlk sıralama (opsiyonel)</label>
      <input type="number" id="k-position" name="firstPosition" min="1" max="500" placeholder="Örn. 14" />
    </div>
    <div class="field">
      <label for="k-date">Ölçüm tarihi</label>
      <input type="date" id="k-date" name="firstDate" value="${todayIso()}" />
    </div>`}
  </div>`;

  openModal({
    title: editing ? 'Anahtar kelimeyi düzenle' : 'Yeni anahtar kelime',
    body,
    submitText: editing ? 'Güncelle' : 'Kaydet',
    onSubmit: async (formData) => {
      const values = formToObject(formData);
      if (!values.keyword) throw new Error('Anahtar kelime girin.');

      const payload = {
        keyword: values.keyword,
        volume: values.volume,
        difficulty: values.difficulty,
        targetUrl: values.targetUrl,
        group: values.group,
      };

      if (!editing && values.firstPosition) {
        payload.positions = [{
          date: values.firstDate || todayIso(),
          position: Number(values.firstPosition),
          note: '',
        }];
      }

      if (editing) {
        await api.put(`/api/keywords/${item.id}`, payload);
      } else {
        await api.post('/api/keywords', payload);
      }
      ctx.toast(editing ? 'Anahtar kelime güncellendi.' : 'Anahtar kelime eklendi.');
      await ctx.refresh();
    },
  });
}

export function openPositionForm(ctx, keyword) {
  const body = `<p class="modal-sub"><strong>${esc(keyword.keyword)}</strong> için yeni sıralama ölçümü ekle. Aynı tarihe ikinci kez kayıt girersen mevcut ölçüm güncellenir.</p>
    <div class="form-grid">
      <div class="field">
        <label for="p-date">Ölçüm tarihi</label>
        <input type="date" id="p-date" name="date" value="${todayIso()}" />
      </div>
      <div class="field">
        <label for="p-position">Sıralama *</label>
        <input type="number" id="p-position" name="position" min="1" max="500" placeholder="Örn. 7" required />
      </div>
      <div class="field span-2">
        <label for="p-note">Not</label>
        <input type="text" id="p-note" name="note" placeholder="Örn. Google TR, masaüstü" />
      </div>
    </div>`;

  openModal({
    title: 'Sıralama ekle',
    body,
    submitText: 'Kaydet',
    onSubmit: async (formData) => {
      const values = formToObject(formData);
      if (!values.position) throw new Error('Sıralama değeri girin.');
      await api.post(`/api/keywords/${keyword.id}/position`, {
        date: values.date,
        position: values.position,
        note: values.note,
      });
      ctx.toast('Sıralama kaydedildi.');
      await ctx.refresh();
    },
  });
}

export function openHistory(ctx, keyword) {
  const list = sortedPositions(keyword).reverse();
  const body = list.length
    ? `<div class="mini-list">
        ${list.map((point, index) => {
          const older = list[index + 1];
          const diff = older ? Number(older.position) - Number(point.position) : null;
          return `<div class="mini-row">
            <div class="mini-row__main">
              <div class="mini-row__title">${esc(fmtDate(point.date))}</div>
              <div class="mini-row__sub">${esc(point.note || 'Not yok')}</div>
            </div>
            <div class="mini-row__side" style="display:flex;align-items:center;gap:8px">
              <strong style="font-size:14px">${fmtNum(point.position)}. sıra</strong>
              ${moveChip(diff)}
            </div>
          </div>`;
        }).join('')}
      </div>`
    : emptyState({ icon: 'history', title: 'Ölçüm yok', text: 'Sıralama ekleyerek geçmişi oluştur.' });

  const dialog = openModal({
    title: `Sıralama geçmişi · ${keyword.keyword}`,
    body,
    cancelText: 'Kapat',
    onSubmit: null,
    footerStart: `<button type="button" class="btn btn--soft btn--sm" id="history-add">${icons.plus} Yeni ölçüm</button>`,
  });

  const addBtn = dialog.querySelector('#history-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      dialog.close();
      openPositionForm(ctx, keyword);
    });
  }
}
