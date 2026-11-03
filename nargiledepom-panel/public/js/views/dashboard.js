import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, chip, fmtDate, fmtMoney, fmtNum, monthShort, monthLabel, todayIso,
  moveChip, emptyState, relTime, daysFromToday, initials, domainOf,
} from '../ui.js';
import { lineChart, sparkline, horizontalBars, chartEmpty } from '../charts.js';
import { BACKLINK_TYPES, BACKLINK_STATUS, MONTHLY_BACKLINK_GOAL } from '../constants.js';

let selectedKeywordId = null;

const sortedPositions = (keyword) =>
  [...(keyword.positions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));

const linkDate = (item) => String(item.publishDate || item.createdAt || '').slice(0, 10);

function kpiCard({ label, value, suffix = '', meta = '', icon = 'chart', tone = 'amber', bar = null }) {
  return `<div class="kpi" style="--kpi-color:var(--${tone});--kpi-glow:var(--${tone}-soft)">
    <div class="kpi__top">
      <span class="kpi__label">${esc(label)}</span>
      <span class="kpi__icon">${icons[icon] || icons.chart}</span>
    </div>
    <div class="kpi__value">${value}${suffix ? `<small>${esc(suffix)}</small>` : ''}</div>
    <div class="kpi__meta">${meta}</div>
    ${bar === null ? '' : `<span class="kpi__bar"><i style="width:${Math.max(0, Math.min(100, bar))}%"></i></span>`}
  </div>`;
}

export function render(container, ctx) {
  const data = ctx.data || {};
  const backlinks = data.backlinks || [];
  const keywords = data.keywords || [];
  const tasks = data.tasks || [];
  const notes = data.notes || [];

  const monthKey = todayIso().slice(0, 7);
  const monthName = monthLabel(monthKey);
  const activeLinks = backlinks.filter((b) => b.status === 'yayinda');
  const plannedLinks = backlinks.filter((b) => b.status === 'planlandi');
  const thisMonthLinks = backlinks.filter((b) => String(b.publishDate || b.createdAt || '').slice(0, 7) === monthKey);

  const withDr = activeLinks.filter((b) => b.dr !== null && b.dr !== undefined);
  const avgDr = withDr.length ? Math.round(withDr.reduce((sum, b) => sum + Number(b.dr), 0) / withDr.length) : null;

  const keywordStats = keywords.map((keyword) => {
    const list = sortedPositions(keyword);
    return {
      keyword,
      last: list[list.length - 1] || null,
      prev: list[list.length - 2] || null,
    };
  });
  const tracked = keywordStats.filter((s) => s.last);
  const top10 = tracked.filter((s) => s.last.position <= 10);
  const top3 = tracked.filter((s) => s.last.position <= 3);
  const improved = keywordStats.filter((s) => s.last && s.prev && s.last.position < s.prev.position);
  const avgRank = tracked.length
    ? (tracked.reduce((sum, s) => sum + Number(s.last.position), 0) / tracked.length).toFixed(1).replace('.', ',')
    : null;

  const openTasks = tasks.filter((t) => t.status !== 'tamam');
  const overdueTasks = openTasks.filter((t) => t.dueDate && daysFromToday(t.dueDate) < 0);
  const nextTasks = [...openTasks].sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')).slice(0, 4);

  const goalPct = Math.round((thisMonthLinks.length / MONTHLY_BACKLINK_GOAL) * 100);
  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - Math.min(1, thisMonthLinks.length / MONTHLY_BACKLINK_GOAL));

  /* Son 12 ay kümülatif backlink */
  const now = new Date();
  const monthKeys = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const cumulative = monthKeys.map((key) =>
    backlinks.filter((b) => b.status !== 'reddedildi' && linkDate(b).slice(0, 7) <= key).length
  );

  const typeCounts = {};
  for (const b of backlinks) {
    if (b.status === 'reddedildi') continue;
    const type = BACKLINK_TYPES[b.type] || 'Diğer';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  const typeItems = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value]) => ({ label, value }));

  /* Sıralama grafiği */
  const trendable = keywordStats.filter((s) => s.last);
  if (!trendable.some((s) => s.keyword.id === selectedKeywordId)) {
    selectedKeywordId = trendable.length ? trendable[0].keyword.id : null;
  }
  const selected = trendable.find((s) => s.keyword.id === selectedKeywordId) || null;
  const selectedPositions = selected ? sortedPositions(selected.keyword) : [];
  const rankChart = selected && selectedPositions.length
    ? lineChart({
        labels: selectedPositions.map((p) => fmtDate(p.date, { year: false })),
        series: [{ name: selected.keyword.keyword, values: selectedPositions.map((p) => p.position), color: '#4fd1c5' }],
        invert: true,
        fill: true,
        height: 222,
        yFormat: (v) => `${v}.`,
      })
    : chartEmpty('Anahtar kelime ve sıralama ekledikçe trend burada oluşur.');

  const recentLinks = [...backlinks]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 5);
  const recentNotes = [...notes]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 3);

  const heroTitle = backlinks.length || keywords.length
    ? `Bu ay <span class="text-amber">${thisMonthLinks.length} yeni backlink</span> eklendi.`
    : 'SEO çalışmalarını tek panelden takip et.';
  const heroSub = backlinks.length || keywords.length
    ? `${top3.length} kelime ilk 3'te, ${top10.length} kelime ilk 10'da. ${overdueTasks.length ? `${overdueTasks.length} geciken görev var.` : 'Görevler yolunda.'}`
    : 'İlk backlinkini ve anahtar kelimeni ekleyerek verilerini kaydetmeye başla. Tüm cihazlardan aynı panele erişebilirsin.';

  container.innerHTML = `<div class="page">
    <section class="hero">
      <div class="hero__text">
        <span class="hero__badge">${icons.sparkles} SEO kontrol merkezi</span>
        <h2 class="hero__title">${heroTitle}</h2>
        <p class="hero__sub">${esc(heroSub)}</p>
        <div class="hero__actions">
          <button type="button" class="btn btn--primary" data-new-backlink>${icons.plus} Backlink ekle</button>
          <button type="button" class="btn btn--ghost" data-new-keyword>${icons.trending} Sıralama gir</button>
        </div>
      </div>
      <div class="hero__goal" aria-label="Aylık backlink hedefi">
        <svg viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${ringR}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>
          <circle cx="40" cy="40" r="${ringR}" fill="none" stroke="#f4b64a" stroke-width="7"
            stroke-dasharray="${ringC.toFixed(1)}" stroke-dashoffset="${ringOffset.toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 40 40)"/>
        </svg>
        <div class="hero__goal-text">
          <strong>${thisMonthLinks.length}<span style="font-size:12px;color:var(--muted-2)">/${MONTHLY_BACKLINK_GOAL}</span></strong>
          <span>aylık hedef</span>
        </div>
      </div>
    </section>

    <div class="kpi-grid">
      ${kpiCard({
        label: 'Yayında Backlink',
        value: fmtNum(activeLinks.length),
        suffix: 'link',
        meta: `${fmtNum(backlinks.length)} kayıt · ${fmtNum(plannedLinks.length)} planlı`,
        icon: 'link',
        tone: 'amber',
      })}
      ${kpiCard({
        label: `${monthName} Eklenen`,
        value: fmtNum(thisMonthLinks.length),
        suffix: 'link',
        meta: `Hedef ${MONTHLY_BACKLINK_GOAL} · %${goalPct}`,
        icon: 'plus',
        tone: 'green',
        bar: goalPct,
      })}
      ${kpiCard({
        label: 'Ortalama DR',
        value: avgDr === null ? '—' : fmtNum(avgDr),
        suffix: avgDr === null ? '' : 'DR',
        meta: `${withDr.length} site üzerinden`,
        icon: 'target',
        tone: 'purple',
      })}
      ${kpiCard({
        label: 'İlk 10 Kelime',
        value: fmtNum(top10.length),
        suffix: `/ ${tracked.length}`,
        meta: `${top3.length} ilk 3'te${improved.length ? ` · ${improved.length} yükseliş` : ''}`,
        icon: 'trending',
        tone: 'blue',
      })}
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Backlink büyümesi</h3>
            <p class="card__sub">Son 12 ay · kümülatif toplam</p>
          </div>
          ${chip(`${fmtNum(cumulative[cumulative.length - 1] || 0)} link`, 'amber', { sm: true })}
        </div>
        <div class="card__body">
          ${backlinks.length
            ? lineChart({
                labels: monthKeys.map(monthShort),
                series: [{ name: 'Backlink', values: cumulative, color: '#f4b64a' }],
                fill: true,
                height: 222,
              })
            : chartEmpty('İlk backlinkini eklediğinde grafik oluşmaya başlar.')}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Backlink türleri</h3>
            <p class="card__sub">Reddedilenler hariç dağılım</p>
          </div>
          ${chip(`${typeItems.length} tür`, 'gray', { sm: true })}
        </div>
        <div class="card__body">
          ${typeItems.length ? horizontalBars(typeItems) : emptyState({ icon: 'link', title: 'Henüz backlink yok', text: 'İlk backlink kaydını ekleyerek dağılımı gör.' })}
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Sıralama trendi</h3>
            <p class="card__sub">${selected ? esc(selected.keyword.keyword) : 'Takip edilen kelimeler'}</p>
          </div>
          ${trendable.length
            ? `<select class="select-sm" id="dash-kw" aria-label="Anahtar kelime seç">
                ${trendable.map((s) => `<option value="${esc(s.keyword.id)}"${s.keyword.id === selectedKeywordId ? ' selected' : ''}>${esc(s.keyword.keyword)}</option>`).join('')}
              </select>`
            : ''}
        </div>
        <div class="card__body">
          ${selected
            ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                 <span class="rank-big rank-big--${selected.last.position <= 3 ? 'top' : selected.last.position <= 10 ? 'good' : 'low'}" style="font-size:22px">${fmtNum(selected.last.position)}<small>.sıra</small></span>
                 ${moveChip(selected.prev ? selected.prev.position - selected.last.position : null)}
                 <span class="text-muted" style="font-size:11px">son ölçüm ${fmtDate(selected.last.date, { year: false })}</span>
               </div>
               ${rankChart}`
            : emptyState({
                icon: 'trending',
                title: 'Henüz sıralama yok',
                text: 'Anahtar kelime ekleyip haftalık sıralamalarını kaydet.',
                action: '<button type="button" class="btn btn--soft btn--sm" data-new-keyword>Kelime ekle</button>',
              })}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Görevler</h3>
            <p class="card__sub">${overdueTasks.length ? `${overdueTasks.length} geciken görev` : 'Geciken görev yok'}</p>
          </div>
          <button type="button" class="link-btn" data-goto="gorevler">Tümü</button>
        </div>
        <div class="card__body">
          ${nextTasks.length
            ? `<div class="mini-list">
                ${nextTasks.map((t) => {
                  const due = t.dueDate ? daysFromToday(t.dueDate) : null;
                  const late = due !== null && due < 0;
                  return `<div class="mini-row">
                    <button type="button" class="check" data-task-toggle="${esc(t.id)}" aria-label="Görevi tamamla">${icons.check}</button>
                    <div class="mini-row__main">
                      <div class="mini-row__title">${esc(t.title)}</div>
                      <div class="mini-row__sub">${esc((t.dueDate && fmtDate(t.dueDate, { year: false })) || 'Tarih yok')}${late ? ' · gecikti' : ''}</div>
                    </div>
                    <span class="chip chip--sm tone-${late ? 'red' : 'gray'}">${late ? 'Geciken' : `${openTasks.length} açık`}</span>
                  </div>`;
                }).join('')}
              </div>`
            : emptyState({ icon: 'checkSquare', title: 'Açık görev yok', text: 'Yeni bir SEO görevi ekleyerek takibe al.', action: '<button type="button" class="btn btn--soft btn--sm" data-new-task>Görev ekle</button>' })}
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Son backlinkler</h3>
            <p class="card__sub">En son eklenen kayıtlar</p>
          </div>
          <button type="button" class="link-btn" data-goto="backlinkler">Tümü</button>
        </div>
        <div class="card__body">
          ${recentLinks.length
            ? `<div class="mini-list">
                ${recentLinks.map((b) => {
                  const name = b.site || domainOf(b.url, '—');
                  const status = BACKLINK_STATUS[b.status] || BACKLINK_STATUS.yayinda;
                  return `<div class="mini-row mini-row--link" data-goto="backlinkler" role="button" tabindex="0">
                    <div class="domain__avatar">${esc(initials(name))}</div>
                    <div class="mini-row__main">
                      <div class="mini-row__title">${esc(name)}</div>
                      <div class="mini-row__sub">${esc(BACKLINK_TYPES[b.type] || 'Diğer')} · ${esc(b.anchor || b.targetPage || '—')}</div>
                    </div>
                    <div class="mini-row__side">${chip(status.label, status.tone, { sm: true })}</div>
                  </div>`;
                }).join('')}
              </div>`
            : emptyState({ icon: 'link', title: 'Henüz backlink yok', text: 'İlk backlinkini ekleyerek listeyi oluştur.', action: '<button type="button" class="btn btn--soft btn--sm" data-new-backlink>Backlink ekle</button>' })}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Notlar</h3>
            <p class="card__sub">Son eklenen not ve raporlar</p>
          </div>
          <button type="button" class="link-btn" data-goto="notlar">Tümü</button>
        </div>
        <div class="card__body">
          ${recentNotes.length
            ? `<div class="mini-list">
                ${recentNotes.map((n) => `<div class="mini-row mini-row--link" data-goto="notlar" role="button" tabindex="0">
                  <div class="mini-row__main">
                    <div class="mini-row__title">${esc(n.title)}</div>
                    <div class="mini-row__sub">${esc(n.month ? monthLabel(n.month) : relTime(n.updatedAt || n.createdAt))}${n.tag ? ` · ${esc(n.tag)}` : ''}</div>
                  </div>
                  <div class="mini-row__side">${icons.chevronRight}</div>
                </div>`).join('')}
              </div>`
            : emptyState({ icon: 'note', title: 'Henüz not yok', text: 'Aylık rapor veya strateji notlarını buraya ekle.', action: '<button type="button" class="btn btn--soft btn--sm" data-new-note>Not ekle</button>' })}
        </div>
      </section>
    </div>
  </div>`;

  /* Olaylar */
  container.querySelectorAll('[data-new-backlink]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.openBacklinkForm())
  );
  container.querySelectorAll('[data-new-keyword]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.openKeywordForm())
  );
  container.querySelectorAll('[data-new-task]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.openTaskForm())
  );
  container.querySelectorAll('[data-new-note]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.openNoteForm())
  );

  const dashKw = container.querySelector('#dash-kw');
  if (dashKw) {
    dashKw.addEventListener('change', () => {
      selectedKeywordId = dashKw.value;
      render(container, ctx);
    });
  }

  container.querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => ctx.navigate(el.dataset.goto));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        ctx.navigate(el.dataset.goto);
      }
    });
  });

  container.querySelectorAll('[data-task-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const task = tasks.find((t) => t.id === btn.dataset.taskToggle);
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
}
