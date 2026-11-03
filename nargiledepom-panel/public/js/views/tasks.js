import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, chip, fmtDate, fmtNum, openModal, confirmAction, formToObject,
  emptyState, todayIso, daysFromToday, debounce, truncate,
} from '../ui.js';
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUS } from '../constants.js';

const state = { q: '', filter: 'open' };

function dueLabel(date) {
  const diff = daysFromToday(date);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  return fmtDate(date, { year: false });
}

function taskHtml(task) {
  const done = task.status === 'tamam';
  const category = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.diger;
  const priority = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES.orta;
  const status = TASK_STATUS[task.status] || TASK_STATUS.bekliyor;
  const diff = task.dueDate ? daysFromToday(task.dueDate) : null;
  const late = !done && diff !== null && diff < 0;

  return `<div class="task${done ? ' task--done' : ''}">
    <button type="button" class="check${done ? ' is-done' : ''}" data-toggle="${esc(task.id)}" aria-label="${done ? 'Görevi yeniden aç' : 'Görevi tamamla'}">${icons.check}</button>
    <div class="task__body">
      <div class="task__title">${esc(task.title)}</div>
      <div class="task__meta">
        ${chip(category.label, category.tone, { sm: true, dot: false })}
        ${chip(priority.label, priority.tone, { sm: true, dot: false })}
        ${done ? chip(status.label, status.tone, { sm: true, dot: false }) : ''}
        ${task.dueDate ? `<span class="task__due${late ? ' task__due--overdue' : ''}">${icons.calendar} ${esc(dueLabel(task.dueDate))}${late ? ' · gecikti' : ''}</span>` : ''}
      </div>
      ${task.notes ? `<div class="task__note">${esc(truncate(task.notes, 140))}</div>` : ''}
    </div>
    <div class="task__actions">
      <button type="button" class="icon-btn icon-btn--sm" data-edit="${esc(task.id)}" title="Düzenle">${icons.edit}</button>
      <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${esc(task.id)}" title="Sil">${icons.trash}</button>
    </div>
  </div>`;
}

export function render(container, ctx) {
  const all = ctx.data.tasks || [];

  container.innerHTML = `<div class="page">
    <div class="toolbar">
      <div class="toolbar__search">
        ${icons.search}
        <input type="search" id="task-q" placeholder="Görev veya not ara…" value="${esc(state.q)}" aria-label="Görev ara" />
      </div>
      <select id="task-filter" aria-label="Görev filtresi">
        <option value="open"${state.filter === 'open' ? ' selected' : ''}>Açık görevler</option>
        <option value="all"${state.filter === 'all' ? ' selected' : ''}>Tümü</option>
        <option value="today"${state.filter === 'today' ? ' selected' : ''}>Bugün</option>
        <option value="overdue"${state.filter === 'overdue' ? ' selected' : ''}>Geciken</option>
        <option value="done"${state.filter === 'done' ? ' selected' : ''}>Tamamlanan</option>
      </select>
      <div class="toolbar__spacer"></div>
      <button type="button" class="btn btn--primary" data-new-task>${icons.plus} Yeni görev</button>
    </div>
    <div id="task-summary" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
    <div id="task-results"></div>
  </div>`;

  const results = container.querySelector('#task-results');
  const summary = container.querySelector('#task-summary');
  const today = todayIso();

  function filtered() {
    const q = state.q.toLocaleLowerCase('tr');
    return all.filter((task) => {
      if (state.filter === 'open' && task.status === 'tamam') return false;
      if (state.filter === 'today' && (task.status === 'tamam' || task.dueDate !== today)) return false;
      if (state.filter === 'overdue' && (task.status === 'tamam' || !task.dueDate || daysFromToday(task.dueDate) >= 0)) return false;
      if (state.filter === 'done' && task.status !== 'tamam') return false;
      if (!q) return true;
      return [task.title, task.notes, TASK_CATEGORIES[task.category]?.label].join(' ').toLocaleLowerCase('tr').includes(q);
    });
  }

  function paint() {
    const list = filtered();
    const open = all.filter((t) => t.status !== 'tamam');
    const overdue = open.filter((t) => t.dueDate && daysFromToday(t.dueDate) < 0);
    const todayTasks = open.filter((t) => t.dueDate === today);
    const done = all.filter((t) => t.status === 'tamam');

    summary.innerHTML = `
      ${chip(`${fmtNum(open.length)} açık`, 'amber', { sm: true, dot: false })}
      ${chip(`${fmtNum(overdue.length)} geciken`, overdue.length ? 'red' : 'gray', { sm: true, dot: false })}
      ${chip(`${fmtNum(todayTasks.length)} bugün`, 'blue', { sm: true, dot: false })}
      ${chip(`${fmtNum(done.length)} tamamlandı`, 'green', { sm: true, dot: false })}
      ${state.q ? chip(`${fmtNum(list.length)} sonuç`, 'purple', { sm: true, dot: false }) : ''}`;

    if (!all.length) {
      results.innerHTML = emptyState({
        icon: 'checkSquare',
        title: 'Henüz görev yok',
        text: 'İçerik, teknik, backlink ve rapor görevlerini ekleyerek SEO çalışmalarını planla.',
        action: `<button type="button" class="btn btn--primary btn--sm" data-new-task>${icons.plus} İlk görevi ekle</button>`,
      });
      results.querySelectorAll('[data-new-task]').forEach((btn) => btn.addEventListener('click', () => openForm(ctx)));
      return;
    }

    if (!list.length) {
      results.innerHTML = emptyState({
        icon: 'checkSquare',
        title: state.filter === 'done' ? 'Tamamlanan görev yok' : 'Bu filtrede görev yok',
        text: 'Farklı bir filtre seçebilir veya yeni bir görev ekleyebilirsin.',
        action: `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="btn btn--soft btn--sm" data-new-task>${icons.plus} Görev ekle</button>
          <button type="button" class="btn btn--ghost btn--sm" data-show-all>Tümünü göster</button>
        </div>`,
      });
      results.querySelectorAll('[data-new-task]').forEach((btn) => btn.addEventListener('click', () => openForm(ctx)));
      results.querySelector('[data-show-all]').addEventListener('click', () => {
        state.filter = 'open';
        state.q = '';
        const input = container.querySelector('#task-q');
        const select = container.querySelector('#task-filter');
        if (input) input.value = '';
        if (select) select.value = 'open';
        paint();
      });
      return;
    }

    const groups = [
      { key: 'overdue', title: 'Geciken', items: [] },
      { key: 'today', title: 'Bugün', items: [] },
      { key: 'week', title: 'Bu hafta', items: [] },
      { key: 'later', title: 'Daha sonra', items: [] },
      { key: 'done', title: 'Tamamlanan', items: [] },
    ];

    for (const task of list) {
      if (task.status === 'tamam') {
        groups[4].items.push(task);
        continue;
      }
      const diff = task.dueDate ? daysFromToday(task.dueDate) : null;
      if (diff !== null && diff < 0) groups[0].items.push(task);
      else if (diff === 0) groups[1].items.push(task);
      else if (diff !== null && diff <= 7) groups[2].items.push(task);
      else groups[3].items.push(task);
    }

    const byDue = (a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
    groups[0].items.sort(byDue);
    groups[1].items.sort(byDue);
    groups[2].items.sort(byDue);
    groups[3].items.sort(byDue);
    groups[4].items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    results.innerHTML = groups
      .filter((group) => group.items.length)
      .map((group) => `<section class="task-group">
        <h3 class="task-group__title">${esc(group.title)}<span class="task-group__count">${group.items.length}</span></h3>
        <div class="task-list">${group.items.map(taskHtml).join('')}</div>
      </section>`).join('');

    wireResults();
  }

  function wireResults() {
    results.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const task = all.find((t) => t.id === btn.dataset.toggle);
        if (!task) return;
        btn.disabled = true;
        try {
          const nextStatus = task.status === 'tamam' ? 'bekliyor' : 'tamam';
          await api.put(`/api/tasks/${task.id}`, { ...task, status: nextStatus });
          ctx.toast(nextStatus === 'tamam' ? 'Görev tamamlandı.' : 'Görev yeniden açıldı.');
          await ctx.refresh();
        } catch (err) {
          ctx.toast(err.message || 'Görev güncellenemedi.', 'error');
          btn.disabled = false;
        }
      });
    });

    results.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const task = all.find((t) => t.id === btn.dataset.edit);
        if (task) openForm(ctx, task);
      });
    });

    results.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const task = all.find((t) => t.id === btn.dataset.delete);
        if (!task) return;
        const ok = await confirmAction({
          title: 'Görev silinsin mi?',
          message: `"${task.title}" görevi kalıcı olarak silinecek.`,
          confirmText: 'Sil',
        });
        if (!ok) return;
        try {
          await api.del(`/api/tasks/${task.id}`);
          ctx.toast('Görev silindi.');
          await ctx.refresh();
        } catch (err) {
          ctx.toast(err.message || 'Silinemedi.', 'error');
        }
      });
    });
  }

  const search = container.querySelector('#task-q');
  const doSearch = debounce(() => {
    state.q = search.value;
    paint();
  }, 160);
  search.addEventListener('input', doSearch);

  container.querySelector('#task-filter').addEventListener('change', (event) => {
    state.filter = event.target.value;
    paint();
  });

  container.querySelector('[data-new-task]').addEventListener('click', () => openForm(ctx));

  paint();
}

export function openForm(ctx, item = null) {
  const editing = Boolean(item);
  const t = item || {};
  const value = (v) => esc(v === null || v === undefined ? '' : v);
  const options = (map, selected) => Object.entries(map)
    .map(([key, info]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${esc(info.label)}</option>`)
    .join('');

  const body = `<div class="form-grid">
    <div class="field span-2">
      <label for="t-title">Görev başlığı *</label>
      <input type="text" id="t-title" name="title" value="${value(t.title)}" placeholder="Örn. Kategori sayfası içerik güncellemesi" required />
    </div>
    <div class="field">
      <label for="t-category">Kategori</label>
      <select id="t-category" name="category">${options(TASK_CATEGORIES, t.category || 'icerik')}</select>
    </div>
    <div class="field">
      <label for="t-priority">Öncelik</label>
      <select id="t-priority" name="priority">${options(TASK_PRIORITIES, t.priority || 'orta')}</select>
    </div>
    <div class="field">
      <label for="t-status">Durum</label>
      <select id="t-status" name="status">${options(TASK_STATUS, t.status || 'bekliyor')}</select>
    </div>
    <div class="field">
      <label for="t-due">Bitiş tarihi</label>
      <input type="date" id="t-due" name="dueDate" value="${value(t.dueDate)}" />
    </div>
    <div class="field span-2">
      <label for="t-notes">Notlar</label>
      <textarea id="t-notes" name="notes" placeholder="Yapılacaklar, bağlantılar, hatırlatmalar…">${value(t.notes)}</textarea>
    </div>
  </div>`;

  openModal({
    title: editing ? 'Görevi düzenle' : 'Yeni görev',
    body,
    submitText: editing ? 'Güncelle' : 'Kaydet',
    onSubmit: async (formData) => {
      const values = formToObject(formData);
      if (!values.title) throw new Error('Görev başlığı girin.');
      if (editing) {
        await api.put(`/api/tasks/${item.id}`, values);
      } else {
        await api.post('/api/tasks', values);
      }
      ctx.toast(editing ? 'Görev güncellendi.' : 'Görev eklendi.');
      await ctx.refresh();
    },
  });
}
