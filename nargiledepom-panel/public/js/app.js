import { api } from './api.js';
import { store } from './store.js';
import { icons } from './icons.js';
import * as ui from './ui.js';
import { renderAuth } from './views/auth.js';
import * as dashboard from './views/dashboard.js';
import * as backlinks from './views/backlinks.js';
import * as keywords from './views/keywords.js';
import * as tasks from './views/tasks.js';
import * as notes from './views/notes.js';
import * as settings from './views/settings.js';

const app = document.getElementById('app');

const NAV = [
  { key: 'panel', label: 'Genel Bakış', short: 'Panel', icon: 'dashboard' },
  { key: 'backlinkler', label: 'Backlinkler', short: 'Backlink', icon: 'link' },
  { key: 'siralama', label: 'Sıralamalar', short: 'Sıralama', icon: 'trending' },
  { key: 'gorevler', label: 'Görevler', short: 'Görev', icon: 'checkSquare' },
  { key: 'notlar', label: 'Notlar', short: 'Not', icon: 'note' },
];

const ROUTES = {
  panel: { title: 'Genel Bakış', render: dashboard.render },
  backlinkler: { title: 'Backlinkler', render: backlinks.render },
  siralama: { title: 'Sıralamalar', render: keywords.render },
  gorevler: { title: 'Görevler', render: tasks.render },
  notlar: { title: 'Notlar', render: notes.render },
  ayarlar: { title: 'Ayarlar', render: settings.render },
};

let bootInfo = null;
let ctx = null;
let mounted = false;
let currentRoute = 'panel';
let busyCount = 0;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                        */
/* ------------------------------------------------------------------ */

function routeKey() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[raw] ? raw : 'panel';
}

function navigate(key) {
  if (!ROUTES[key]) return;
  if (routeKey() === key) {
    renderRoute();
    return;
  }
  window.location.hash = `#/${key}`;
}

function setSync(isBusy) {
  const el = document.getElementById('sync');
  const label = document.getElementById('sync-label');
  if (!el) return;
  el.classList.toggle('is-busy', isBusy);
  if (label) label.textContent = isBusy ? 'Kaydediliyor…' : 'Kayıtlı';
}

function shellHtml() {
  const sidebarLinks = NAV.map((n) => `
    <a href="#/${n.key}" class="nav__link" data-route="${n.key}">
      ${icons[n.icon]}<span>${n.label}</span>
    </a>`).join('');

  const bottomLinks = NAV.map((n) => `
    <a href="#/${n.key}" class="bottom-nav__link" data-route="${n.key}">
      ${icons[n.icon]}<span>${n.short}</span>
    </a>`).join('');

  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand__mark">N</div>
        <div class="brand__text">
          <div class="brand__name">nargiledepom</div>
          <div class="brand__sub">SEO Paneli</div>
        </div>
      </div>

      <nav class="nav">
        ${sidebarLinks}
        <div class="nav__sep"></div>
        <a href="#/ayarlar" class="nav__link" data-route="ayarlar">${icons.settings}<span>Ayarlar</span></a>
      </nav>

      <div class="sidebar__foot">
        <div class="sidebar__site">${icons.globe}<a href="https://nargiledepom.com" target="_blank" rel="noopener">nargiledepom.com</a></div>
        <button type="button" class="btn btn--ghost btn--sm" data-logout>${icons.logout}<span>Çıkış yap</span></button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar__left">
          <div class="brand__mark topbar__mark hide-desktop">N</div>
          <div class="topbar__titles">
            <p class="eyebrow">nargiledepom.com</p>
            <h1 class="page-title" id="page-title">Genel Bakış</h1>
          </div>
        </div>
        <div class="topbar__actions">
          <span class="sync" id="sync"><span class="sync__dot"></span><span id="sync-label">Kayıtlı</span></span>
          <button type="button" class="icon-btn hide-desktop" id="settings-btn" aria-label="Ayarlar">${icons.settings}</button>
          <button type="button" class="btn btn--primary" id="quick-add">${icons.plus}<span class="hide-xs">Ekle</span></button>
        </div>
      </header>

      <main id="view"></main>

      <nav class="bottom-nav" aria-label="Ana menü">
        ${bottomLinks}
      </nav>
    </div>
  </div>`;
}

function renderRoute({ scroll = true } = {}) {
  if (!mounted) return;
  currentRoute = routeKey();
  const route = ROUTES[currentRoute];
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = route.title;
  document.title = `${route.title} · NargileDepom SEO`;

  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === currentRoute);
  });

  const host = document.getElementById('view');
  if (!host) return;
  host.innerHTML = '';
  route.render(host, ctx);
  if (scroll) window.scrollTo(0, 0);
}

function openQuickMenu(anchor) {
  const existing = document.querySelector('.quick-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'quick-menu';
  menu.innerHTML = `
    <button type="button" data-add="backlink">${icons.link}<span>Backlink ekle</span></button>
    <button type="button" data-add="keyword">${icons.trending}<span>Anahtar kelime ekle</span></button>
    <button type="button" data-add="task">${icons.checkSquare}<span>Görev ekle</span></button>
    <div class="quick-menu__sep"></div>
    <button type="button" data-add="note">${icons.note}<span>Not ekle</span></button>`;
  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const width = 210;
  const height = 190;
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
  let top = rect.bottom + 8;
  if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onPointer = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) close();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey);
  };

  setTimeout(() => {
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
  }, 0);

  menu.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.add;
      close();
      if (type === 'backlink') ctx.openBacklinkForm();
      else if (type === 'keyword') ctx.openKeywordForm();
      else if (type === 'task') ctx.openTaskForm();
      else if (type === 'note') ctx.openNoteForm();
    });
  });
}

async function doLogout() {
  try {
    await api.post('/api/logout');
  } catch (_) {
    /* yoksay */
  }
  window.location.reload();
}

function startApp(data) {
  store.setData(data);
  app.innerHTML = shellHtml();
  mounted = true;

  const quickBtn = document.getElementById('quick-add');
  if (quickBtn) quickBtn.addEventListener('click', () => openQuickMenu(quickBtn));

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => navigate('ayarlar'));

  document.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', doLogout);
  });

  renderRoute();
}

function renderFatal(message) {
  app.innerHTML = `<div class="auth">
    <div class="auth__bg"></div>
    <div class="auth__card" style="text-align:center">
      <div class="brand__mark" style="margin:0 auto 16px;width:48px;height:48px;border-radius:15px;font-size:22px">!</div>
      <h1 class="auth__title">Panele ulaşılamadı</h1>
      <p class="auth__sub">${ui.esc(message)}</p>
      <button type="button" class="btn btn--primary btn--lg btn--block" id="retry">Tekrar dene</button>
    </div>
  </div>`;
  const retry = document.getElementById('retry');
  if (retry) retry.addEventListener('click', () => window.location.reload());
}

/* ------------------------------------------------------------------ */
/* Başlat                                                             */
/* ------------------------------------------------------------------ */

async function init() {
  let boot;
  try {
    boot = await api.get('/api/bootstrap');
  } catch (err) {
    renderFatal(err.message || 'Sunucuya bağlanılamadı.');
    return;
  }
  bootInfo = boot;

  if (!boot.authed) {
    renderAuth(app, boot, (data) => {
      bootInfo.authed = true;
      startApp(data);
    });
    return;
  }

  startApp(boot.data);
}

ctx = {
  get data() {
    return store.data;
  },
  navigate,
  toast: ui.toast,
  logout: doLogout,
  get envPassword() {
    return Boolean(bootInfo && bootInfo.envPassword);
  },
  async refresh() {
    const data = await api.get('/api/data');
    store.setData(data);
    return data;
  },
  openBacklinkForm: (item) => backlinks.openForm(ctx, item),
  openKeywordForm: (item) => keywords.openForm(ctx, item),
  openTaskForm: (item) => tasks.openForm(ctx, item),
  openNoteForm: (item) => notes.openForm(ctx, item),
};

store.subscribe(() => {
  if (mounted) renderRoute({ scroll: false });
});

window.addEventListener('hashchange', () => {
  if (mounted) renderRoute();
});
window.addEventListener('api:start', () => {
  busyCount += 1;
  setSync(true);
});
window.addEventListener('api:end', () => {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0) setSync(false);
});
window.addEventListener('auth:required', () => {
  window.location.reload();
});
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason && event.reason.message ? event.reason.message : 'Beklenmeyen bir hata oluştu.';
  ui.toast(msg, 'error');
});

init();
