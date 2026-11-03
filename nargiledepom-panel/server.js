'use strict';

/**
 * nargiledepom.com SEO & Backlink Paneli
 * Bagimliliksiz (pure Node.js) sunucu.
 *
 * Calistirma:      node server.js
 * Sifre belirleme:  ADMIN_PASSWORD ortam degiskeni veya ilk acilista kurulum ekrani
 * Veri klasoru:     DATA_DIR (varsayilan: ./data)
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ENV_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 60;
const BODY_LIMIT = 1024 * 1024;
const IMPORT_LIMIT = 15 * 1024 * 1024;
const SITE = 'nargiledepom.com';

const BACKLINK_TYPES = ['blog', 'konuk', 'forum', 'profil', 'web2', 'pbn', 'haber', 'sosyal', 'dizin', 'video', 'diger'];
const BACKLINK_STATUS = ['yayinda', 'planlandi', 'kaldirildi', 'reddedildi'];
const INDEX_STATUS = ['indexli', 'beklemede', 'indexsiz', 'bilinmiyor'];
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'];
const TASK_CATEGORIES = ['icerik', 'teknik', 'backlink', 'sosyal', 'rapor', 'diger'];
const TASK_PRIORITIES = ['dusuk', 'orta', 'yuksek'];
const TASK_STATUS = ['bekliyor', 'devam', 'tamam'];

/* ------------------------------------------------------------------ */
/* Veritabani (JSON dosyasi)                                          */
/* ------------------------------------------------------------------ */

let db = emptyDb();
let writeChain = Promise.resolve();

function emptyDb() {
  return {
    version: 1,
    site: SITE,
    createdAt: new Date().toISOString(),
    auth: null,
    sessions: [],
    backlinks: [],
    keywords: [],
    tasks: [],
    notes: [],
  };
}

function ensureDbShape(raw) {
  const base = emptyDb();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    auth: raw.auth && typeof raw.auth === 'object' ? raw.auth : null,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    backlinks: Array.isArray(raw.backlinks) ? raw.backlinks : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

async function loadDb() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    const txt = await fsp.readFile(DB_FILE, 'utf8');
    db = ensureDbShape(JSON.parse(txt));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[db] Okunamadi, yeni veritabani olusturuluyor:', err.message);
    db = emptyDb();
    await saveDb();
  }
  const now = Date.now();
  const valid = db.sessions.filter((s) => s && typeof s.h === 'string' && Number(s.exp) > now);
  if (valid.length !== db.sessions.length) {
    db.sessions = valid;
    await saveDb();
  }
}

function saveDb() {
  const json = JSON.stringify(db, null, 2);
  const tmp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await fsp.writeFile(tmp, json, 'utf8');
      await fsp.rename(tmp, DB_FILE);
    })
    .catch((err) => {
      console.error('[db] Yazilamadi:', err.message);
      try { fs.unlinkSync(tmp); } catch (_) { /* yoksay */ }
    });
  return writeChain;
}

/* ------------------------------------------------------------------ */
/* Sifre ve oturum                                                    */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function storedPasswordOk(password) {
  if (!db.auth || !db.auth.salt || !db.auth.hash) return false;
  const { hash } = hashPassword(password, db.auth.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(db.auth.hash, 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function envPasswordOk(password) {
  if (!ENV_PASSWORD) return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(ENV_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function isConfigured() {
  return Boolean(ENV_PASSWORD) || Boolean(db.auth && db.auth.hash);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function isSecureRequest(req) {
  if (req.socket.encrypted) return true;
  if (TRUST_PROXY) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    if (proto === 'https') return true;
  }
  return false;
}

function createSession(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const h = tokenHash(token);
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => s && Number(s.exp) > now);
  db.sessions.push({ h, exp: now + SESSION_TTL_MS, created: now });
  if (db.sessions.length > MAX_SESSIONS) db.sessions = db.sessions.slice(-MAX_SESSIONS);
  saveDb();
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
  return h;
}

function currentSession(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const h = tokenHash(token);
  const session = db.sessions.find((s) => s && s.h === h);
  if (!session) return null;
  if (Number(session.exp) <= Date.now()) {
    db.sessions = db.sessions.filter((s) => s !== session);
    saveDb();
    return null;
  }
  return session;
}

function destroySession(req, res) {
  const token = parseCookies(req).sid;
  if (token) {
    const h = tokenHash(token);
    db.sessions = db.sessions.filter((s) => s && s.h !== h);
    saveDb();
  }
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* Giris denemesi siniri: IP basina 15 dakikada 8 deneme */
const loginAttempts = new Map();
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const ATTEMPT_MAX = 8;

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || 'unknown';
}

function attemptStatus(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt <= now) return { blocked: false, left: ATTEMPT_MAX, retry: 0 };
  return { blocked: rec.count >= ATTEMPT_MAX, left: Math.max(0, ATTEMPT_MAX - rec.count), retry: Math.ceil((rec.resetAt - now) / 1000) };
}

function registerFailure(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt <= now) loginAttempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW });
  else rec.count += 1;
  if (loginAttempts.size > 2000) {
    for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Yardimcilar                                                        */
/* ------------------------------------------------------------------ */

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function str(value, max = 1000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function numOrNull(value, min = 0, max = 1e9) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(Math.max(n, min), max) * 100) / 100;
}

function intOrNull(value, min = 0, max = 1e9) {
  const n = numOrNull(value, min, max);
  return n === null ? null : Math.round(n);
}

function dateStr(value) {
  const s = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function publicData() {
  return {
    site: db.site || SITE,
    backlinks: db.backlinks,
    keywords: db.keywords,
    tasks: db.tasks,
    notes: db.notes,
  };
}

function requireAuth(req, res) {
  if (currentSession(req)) return true;
  sendJson(res, 401, { error: 'Oturum gecersiz. Lutfen tekrar giris yapin.', code: 'auth' });
  return false;
}

/* ------------------------------------------------------------------ */
/* Veri dogrulama                                                     */
/* ------------------------------------------------------------------ */

function normBacklink(input) {
  return {
    site: str(input.site, 120),
    url: str(input.url, 500),
    type: pick(input.type, BACKLINK_TYPES, 'blog'),
    targetPage: str(input.targetPage, 300),
    anchor: str(input.anchor, 200),
    dr: intOrNull(input.dr, 0, 100),
    da: intOrNull(input.da, 0, 100),
    price: numOrNull(input.price, 0, 1e9),
    currency: pick(input.currency, CURRENCIES, 'TRY'),
    status: pick(input.status, BACKLINK_STATUS, 'yayinda'),
    indexStatus: pick(input.indexStatus, INDEX_STATUS, 'bilinmiyor'),
    publishDate: dateStr(input.publishDate),
    expiryDate: dateStr(input.expiryDate),
    contact: str(input.contact, 200),
    notes: str(input.notes, 3000),
  };
}

function normalizePositions(input) {
  if (!Array.isArray(input)) return [];
  const map = new Map();
  for (const p of input.slice(0, 500)) {
    if (!p || typeof p !== 'object') continue;
    const date = dateStr(p.date);
    const position = numOrNull(p.position, 1, 500);
    if (!date || position === null) continue;
    map.set(date, { date, position: Math.round(position), note: str(p.note, 300) });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normKeyword(input, existing) {
  const base = existing || {};
  return {
    keyword: str(input.keyword, 150) || base.keyword || '',
    volume: intOrNull(input.volume, 0, 1e9),
    difficulty: intOrNull(input.difficulty, 0, 100),
    targetUrl: str(input.targetUrl, 300),
    group: str(input.group, 80),
    positions: input.positions !== undefined ? normalizePositions(input.positions) : normalizePositions(base.positions),
  };
}

function normTask(input) {
  return {
    title: str(input.title, 200),
    category: pick(input.category, TASK_CATEGORIES, 'diger'),
    priority: pick(input.priority, TASK_PRIORITIES, 'orta'),
    status: pick(input.status, TASK_STATUS, 'bekliyor'),
    dueDate: dateStr(input.dueDate),
    notes: str(input.notes, 2000),
  };
}

function normNote(input) {
  return {
    title: str(input.title, 200),
    month: /^\d{4}-\d{2}$/.test(str(input.month, 7)) ? str(input.month, 7) : '',
    tag: str(input.tag, 60),
    content: str(input.content, 20000),
  };
}

function collectionConfig(name, input, existing) {
  if (name === 'backlinks') {
    const data = normBacklink(input);
    if (!data.site && !data.url) throw httpError(400, 'Site adi veya baglanti adresi gerekli.');
    return data;
  }
  if (name === 'keywords') {
    const data = normKeyword(input, existing);
    if (!data.keyword) throw httpError(400, 'Anahtar kelime gerekli.');
    return data;
  }
  if (name === 'tasks') {
    const data = normTask(input);
    if (!data.title) throw httpError(400, 'Gorev basligi gerekli.');
    return data;
  }
  if (name === 'notes') {
    const data = normNote(input);
    if (!data.title) throw httpError(400, 'Not basligi gerekli.');
    return data;
  }
  throw httpError(404, 'Bilinmeyen kayit tipi.');
}

/* ------------------------------------------------------------------ */
/* CSV / disa aktarma                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(';')];
  for (const row of rows) lines.push(row.map(csvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function backlinksCsv() {
  const headers = ['Site', 'URL', 'Tur', 'Hedef Sayfa', 'Anchor', 'DR', 'DA', 'Fiyat', 'Para Birimi', 'Durum', 'Index', 'Yayin Tarihi', 'Bitis Tarihi', 'Iletisim', 'Notlar'];
  const rows = db.backlinks.map((b) => [
    b.site, b.url, b.type, b.targetPage, b.anchor, b.dr, b.da, b.price, b.currency,
    b.status, b.indexStatus, b.publishDate, b.expiryDate, b.contact, b.notes,
  ]);
  return toCsv(headers, rows);
}

function keywordsCsv() {
  const headers = ['Anahtar Kelime', 'Arama Hacmi', 'Zorluk', 'Hedef URL', 'Grup', 'Son Sirada', 'En Iyi', 'Olcum Sayisi', 'Son Olcum'];
  const rows = db.keywords.map((k) => {
    const list = normalizePositions(k.positions);
    const last = list[list.length - 1];
    const best = list.reduce((min, p) => (min === null || p.position < min ? p.position : min), null);
    return [k.keyword, k.volume, k.difficulty, k.targetUrl, k.group, last ? last.position : '', best, list.length, last ? last.date : ''];
  });
  return toCsv(headers, rows);
}

/* ------------------------------------------------------------------ */
/* Demo verisi                                                        */
/* ------------------------------------------------------------------ */

function demoData() {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const daysAhead = (n) => daysAgo(-n);
  const monthsAgo = (n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const stamp = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const b = (i, site, url, type, targetPage, anchor, dr, da, price, status, indexStatus, publishDate, contact, notes) => ({
    id: newId(),
    site, url, type, targetPage, anchor, dr, da, price,
    currency: 'TRY',
    status, indexStatus, publishDate,
    expiryDate: '',
    contact, notes,
    demo: true,
    createdAt: stamp(i),
    updatedAt: stamp(i),
  });

  const backlinks = [
    b(210, 'keyifblogu.com', 'https://keyifblogu.com/nargile-rehberi', 'blog', '/nargile-takimlari', 'nargile takımı', 38, 41, 750, 'yayinda', 'indexli', daysAgo(210), 'iletisim@keyifblogu.com', 'Konuk yazı, 2 link.'),
    b(185, 'forum.nargileseverler.com', 'https://forum.nargileseverler.com/konu/nargile-onerileri', 'forum', '/', 'nargile malzemeleri', 22, 18, 0, 'yayinda', 'indexli', daysAgo(185), '', 'Profil linki + imza.'),
    b(160, 'haber37.com', 'https://haber37.com/yasam/nargile-keyfi', 'haber', '/blog/nargile-nasil-yakilir', 'nargile nasıl yakılır', 55, 48, 1800, 'yayinda', 'indexli', daysAgo(160), 'editor@haber37.com', 'Sponsorlu içerik.'),
    b(140, 'ortaasyablog.com', 'https://ortaasyablog.com/nargile-tutunu-secimi', 'konuk', '/nargile-tutunu', 'nargile tütünü', 31, 27, 900, 'yayinda', 'beklemede', daysAgo(140), '', 'Index için iç link bekleniyor.'),
    b(125, 'web2nargile.wordpress.com', 'https://web2nargile.wordpress.com', 'web2', '/', 'nargiledepom', 12, 9, 250, 'yayinda', 'indexli', daysAgo(125), '', 'Web 2.0 bloğu.'),
    b(110, 'instagram.com', 'https://instagram.com/nargiledepom', 'sosyal', '/', '@nargiledepom', 99, 98, 0, 'yayinda', 'bilinmiyor', daysAgo(110), '', 'Profil biyografisinde link.'),
    b(98, 'dizinlerburada.com', 'https://dizinlerburada.com/kayit/nargiledepom', 'dizin', '/', 'nargile satın al', 15, 20, 100, 'yayinda', 'indexli', daysAgo(98), '', 'Genel dizin kaydı.'),
    b(84, 'youtube.com', 'https://youtube.com/watch?v=nargile-tanitim', 'video', '/nargile-takimi', 'nargile takımı fiyatları', 100, 100, 0, 'yayinda', 'indexli', daysAgo(84), '', 'Ürün tanıtım videosu açıklaması.'),
    b(70, 'yasamblogu.net', 'https://yasamblogu.net/nargile-komuru', 'blog', '/nargile-komuru', 'nargile kömürü', 29, 33, 600, 'yayinda', 'indexli', daysAgo(70), '', 'Konuk yazı.'),
    b(56, 'seo-dergi.com', 'https://seo-dergi.com/nargile-eticaret', 'konuk', '/', 'nargile', 44, 39, 1200, 'yayinda', 'indexli', daysAgo(56), 'yazi@seo-dergi.com', 'Sektör analizi içinde marka linki.'),
    b(40, 'kampanyablog.com', 'https://kampanyablog.com/nargile-firsatlari', 'haber', '/', 'nargile fiyatları', 35, 30, 850, 'yayinda', 'beklemede', daysAgo(40), '', 'Yayınlandı, index bekleniyor.'),
    b(28, 'nargileforum.net', 'https://nargileforum.net/konu/nargiledepom-deneyim', 'forum', '/', 'nargiledepom.com', 18, 14, 0, 'yayinda', 'indexli', daysAgo(28), '', 'Marka bahsi + link.'),
    b(20, 'gezirotasi.com', 'https://gezirotasi.com/nargile-keyfi', 'blog', '/blog/nargile-keyfi', 'nargile keyfi', 26, 24, 500, 'yayinda', 'indexli', daysAgo(20), '', ''),
    b(14, 'teknoincele.com', 'https://teknoincele.com/elektronik-nargile', 'konuk', '/elektronik-nargile', 'elektronik nargile', 33, 29, 700, 'planlandi', 'bilinmiyor', daysAhead(7), 'info@teknoincele.com', 'Yayın tarihi planlandı.'),
    b(10, 'eski-blog.com', 'https://eski-blog.com/nargile', 'blog', '/', 'nargile', 10, 8, 150, 'kaldirildi', 'indexsiz', daysAgo(240), '', 'Site sahibi linki kaldırdı.'),
    b(7, 'spam-link.net', 'https://spam-link.net/nargile', 'pbn', '/', 'nargile satın al', 4, 3, 50, 'reddedildi', 'indexsiz', daysAgo(7), '', 'Kalitesiz, iade edildi.'),
    b(4, 'modablog.com', 'https://modablog.com/nargile-dekor', 'blog', '/', 'nargile takımı', 21, 19, 400, 'planlandi', 'bilinmiyor', daysAhead(12), '', 'Outreach yanıtı bekleniyor.'),
    b(2, 'kulturveyasam.com', 'https://kulturveyasam.com/nargile-kulturu', 'konuk', '/blog/nargile-kulturu', 'nargile kültürü', 40, 36, 1000, 'planlandi', 'bilinmiyor', daysAhead(18), '', 'Yazı teslim edildi.'),
  ];

  const kw = (i, keyword, volume, difficulty, targetUrl, group, values) => {
    const positions = values.map((position, idx) => {
      const offset = (values.length - 1 - idx) * 7;
      return { date: daysAgo(offset), position, note: '' };
    });
    const first = stamp((values.length - 1) * 7);
    return {
      id: newId(), keyword, volume, difficulty, targetUrl, group, positions,
      demo: true, createdAt: first, updatedAt: stamp(0),
    };
  };

  const keywords = [
    kw(1, 'nargile takımı', 1300, 42, '/nargile-takimlari', 'Ürün', [18, 16, 15, 12, 11, 9, 8, 7]),
    kw(2, 'nargile tütünü', 2400, 51, '/nargile-tutunu', 'Ürün', [24, 22, 20, 19, 17, 16, 14, 13]),
    kw(3, 'nargile kömürü', 880, 28, '/nargile-komuru', 'Ürün', [12, 11, 10, 9, 8, 8, 6, 5]),
    kw(4, 'nargile fiyatları', 1900, 47, '/', 'Genel', [32, 30, 28, 26, 25, 23, 21, 20]),
    kw(5, 'nargile malzemeleri', 480, 31, '/nargile-malzemeleri', 'Kategori', [15, 14, 14, 13, 11, 10, 9, 8]),
    kw(6, 'elektronik nargile', 720, 38, '/elektronik-nargile', 'Ürün', [40, 38, 35, 33, 31, 30, 28, 27]),
    kw(7, 'nargile camı', 590, 26, '/nargile-cami', 'Ürün', [22, 20, 19, 17, 16, 15, 14, 12]),
    kw(8, 'tek kişilik nargile', 260, 22, '/tek-kisilik-nargile', 'Ürün', [9, 8, 8, 7, 6, 6, 5, 4]),
  ];

  const task = (i, title, category, priority, status, dueDate, notes) => ({
    id: newId(), title, category, priority, status, dueDate, notes,
    demo: true, createdAt: stamp(i), updatedAt: stamp(0),
  });

  const tasks = [
    task(12, 'Nargile takımı kategori sayfası içerik güncellemesi', 'icerik', 'yuksek', 'devam', daysAhead(3), 'Ürün açıklamaları ve FAQ bölümü eklenecek.'),
    task(9, 'Core Web Vitals iyileştirmesi (LCP / CLS)', 'teknik', 'yuksek', 'bekliyor', daysAhead(5), 'Görsel boyutları ve font yüklemesi kontrol edilecek.'),
    task(8, '10 adet konuk blog outreach takibi', 'backlink', 'orta', 'devam', daysAhead(10), 'Hedef: DR 25+ siteler.'),
    task(6, 'Kasım ayı SEO ve backlink raporu', 'rapor', 'orta', 'bekliyor', daysAhead(12), 'Panel verilerinden özet çıkarılacak.'),
    task(15, 'Ürün şemaları (Product schema) ekleme', 'teknik', 'orta', 'tamam', daysAgo(2), 'Tüm ürün sayfalarına uygulandı.'),
    task(5, 'Instagram içerik takvimi hazırlığı', 'sosyal', 'dusuk', 'bekliyor', daysAhead(7), 'Haftalık 3 gönderi.'),
    task(18, 'Kırık link taraması ve yönlendirmeler', 'teknik', 'dusuk', 'tamam', daysAgo(5), 'Screaming Frog çıktısı temizlendi.'),
    task(3, 'Nargile tütünü rehberi yazısı', 'icerik', 'yuksek', 'bekliyor', daysAhead(1), 'Hedef kelime: nargile tütünü çeşitleri.'),
  ];

  const notes = [
    {
      id: newId(),
      title: `${monthsAgo(1)} SEO ve Backlink Özeti`,
      month: monthsAgo(1),
      tag: 'Aylık Rapor',
      content: 'Backlink profiline 4 yeni site eklendi. Nargile takımı kelimesi ilk sayfaya yaklaştı. Önümüzdeki ay konuk yazı sayısını artırıp, kategori sayfalarındaki içerik derinliğine odaklanacağız.',
      demo: true, createdAt: stamp(10), updatedAt: stamp(10),
    },
    {
      id: newId(),
      title: 'Backlink Stratejisi Notları',
      month: monthsAgo(2),
      tag: 'Strateji',
      content: 'Öncelik: DR 25-50 arası, nargile/kafe/yaşam nişindeki bloglar. Ayda 6-8 kaliteli link hedefi. Forum ve dizin linkleri destekleyici olarak kullanılacak. PBN ve spam sitelerden uzak durulacak.',
      demo: true, createdAt: stamp(35), updatedAt: stamp(35),
    },
    {
      id: newId(),
      title: 'Anahtar Kelime Hedefleme Planı',
      month: monthsAgo(0),
      tag: 'Plan',
      content: 'Öncelikli kelimeler: nargile takımı, nargile tütünü, nargile kömürü. Ürün sayfalarına iç link desteği verilecek. Blog tarafında "nasıl yapılır" ve "rehber" içerikleriyle uzun kuyruk trafiği büyütülecek.',
      demo: true, createdAt: stamp(6), updatedAt: stamp(6),
    },
  ];

  return { backlinks, keywords, tasks, notes };
}

/* ------------------------------------------------------------------ */
/* HTTP altyapisi                                                     */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(httpError(413, 'Gonderilen veri cok buyuk.'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}

async function parseJson(req, limit = BODY_LIMIT) {
  const raw = await readBody(req, limit);
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw httpError(400, 'Gecersiz JSON verisi.');
  }
}

function sameOriginOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return o.host === req.headers.host;
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Rotalar                                                            */
/* ------------------------------------------------------------------ */

const routes = [];

function route(method, pattern, handler) {
  routes.push({ method, regex: new RegExp(`^${pattern}$`), handler });
}

route('GET', '/api/health', async (req, res) => {
  sendJson(res, 200, { ok: true, site: SITE, uptime: Math.round(process.uptime()) });
});

route('GET', '/api/bootstrap', async (req, res) => {
  const session = currentSession(req);
  sendJson(res, 200, {
    authed: Boolean(session),
    configured: isConfigured(),
    envPassword: Boolean(ENV_PASSWORD),
    site: SITE,
    serverTime: nowIso(),
    data: session ? publicData() : null,
  });
});

route('POST', '/api/login', async (req, res) => {
  if (!isConfigured()) throw httpError(409, 'Panel henüz kurulmadı. Önce bir şifre belirleyin.');
  const ip = clientIp(req);
  const status = attemptStatus(ip);
  if (status.blocked) {
    throw httpError(429, `Çok fazla hatalı deneme. ${Math.ceil(status.retry / 60)} dakika sonra tekrar deneyin.`);
  }
  const body = await parseJson(req);
  const password = String(body.password || '');
  if (!password) throw httpError(400, 'Şifre gerekli.');
  const ok = envPasswordOk(password) || storedPasswordOk(password);
  if (!ok) {
    registerFailure(ip);
    throw httpError(401, `Şifre hatalı. Kalan deneme hakkı: ${Math.max(0, ATTEMPT_MAX - (loginAttempts.get(ip)?.count || 0))}`);
  }
  loginAttempts.delete(ip);
  createSession(req, res);
  sendJson(res, 200, { ok: true, data: publicData() });
});

route('POST', '/api/setup', async (req, res) => {
  if (isConfigured()) throw httpError(409, 'Panel zaten kurulmuş.');
  const body = await parseJson(req);
  const password = String(body.password || '');
  if (password.length < 6) throw httpError(400, 'Şifre en az 6 karakter olmalı.');
  if (password.length > 200) throw httpError(400, 'Şifre çok uzun.');
  db.auth = hashPassword(password);
  createSession(req, res);
  sendJson(res, 200, { ok: true, data: publicData() });
});

route('POST', '/api/logout', async (req, res) => {
  destroySession(req, res);
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/data', async (req, res) => {
  if (!requireAuth(req, res)) return;
  sendJson(res, 200, publicData());
});

route('POST', '/api/settings/password', async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (ENV_PASSWORD) throw httpError(400, 'Şifre ADMIN_PASSWORD ortam değişkeniyle yönetiliyor. Değiştirmek için sunucu ayarını güncelleyin.');
  const body = await parseJson(req);
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (!storedPasswordOk(current)) throw httpError(401, 'Mevcut şifre hatalı.');
  if (next.length < 6) throw httpError(400, 'Yeni şifre en az 6 karakter olmalı.');
  if (next.length > 200) throw httpError(400, 'Yeni şifre çok uzun.');
  db.auth = hashPassword(next);
  const session = currentSession(req);
  db.sessions = db.sessions.filter((s) => s.h === session.h);
  await saveDb();
  sendJson(res, 200, { ok: true });
});

/* Genel CRUD: backlinks / keywords / tasks / notes */
for (const collection of ['backlinks', 'keywords', 'tasks', 'notes']) {
  route('POST', `/api/${collection}`, async (req, res) => {
    if (!requireAuth(req, res)) return;
    const body = await parseJson(req);
    const item = collectionConfig(collection, body);
    const now = nowIso();
    const record = { id: newId(), ...item, createdAt: now, updatedAt: now };
    db[collection].unshift(record);
    await saveDb();
    sendJson(res, 201, record);
  });

  route('PUT', `/api/${collection}/([A-Za-z0-9-]+)`, async (req, res, params) => {
    if (!requireAuth(req, res)) return;
    const existing = db[collection].find((x) => x.id === params[0]);
    if (!existing) throw httpError(404, 'Kayıt bulunamadı.');
    const body = await parseJson(req);
    const item = collectionConfig(collection, { ...existing, ...body }, existing);
    Object.assign(existing, item, { updatedAt: nowIso() });
    await saveDb();
    sendJson(res, 200, existing);
  });

  route('DELETE', `/api/${collection}/([A-Za-z0-9-]+)`, async (req, res, params) => {
    if (!requireAuth(req, res)) return;
    const before = db[collection].length;
    db[collection] = db[collection].filter((x) => x.id !== params[0]);
    if (db[collection].length === before) throw httpError(404, 'Kayıt bulunamadı.');
    await saveDb();
    sendJson(res, 200, { ok: true });
  });
}

route('POST', '/api/keywords/([A-Za-z0-9-]+)/position', async (req, res, params) => {
  if (!requireAuth(req, res)) return;
  const keyword = db.keywords.find((k) => k.id === params[0]);
  if (!keyword) throw httpError(404, 'Anahtar kelime bulunamadı.');
  const body = await parseJson(req);
  const date = dateStr(body.date) || new Date().toISOString().slice(0, 10);
  const position = numOrNull(body.position, 1, 500);
  if (position === null) throw httpError(400, 'Geçerli bir sıralama değeri girin.');
  const positions = normalizePositions(keyword.positions).filter((p) => p.date !== date);
  positions.push({ date, position: Math.round(position), note: str(body.note, 300) });
  keyword.positions = positions.sort((a, b) => a.date.localeCompare(b.date));
  keyword.updatedAt = nowIso();
  await saveDb();
  sendJson(res, 200, keyword);
});

route('GET', '/api/export/all', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const payload = JSON.stringify({ exportedAt: nowIso(), site: SITE, ...publicData() }, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="nargiledepom-seo-${stamp}.json"`,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
});

route('GET', '/api/export/backlinks.csv', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const stamp = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="nargiledepom-backlinks-${stamp}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.end(backlinksCsv());
});

route('GET', '/api/export/keywords.csv', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const stamp = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="nargiledepom-keywords-${stamp}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.end(keywordsCsv());
});

route('POST', '/api/import', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await parseJson(req, IMPORT_LIMIT);
  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
  const counts = { backlinks: 0, keywords: 0, tasks: 0, notes: 0 };
  for (const collection of Object.keys(counts)) {
    const list = payload[collection];
    if (!Array.isArray(list)) continue;
    if (list.length > 5000) throw httpError(400, `${collection} icin en fazla 5000 kayit aktarilabilir.`);
    if (mode === 'replace') db[collection] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      try {
        const item = collectionConfig(collection, raw);
        const now = nowIso();
        const id = typeof raw.id === 'string' && db[collection].every((x) => x.id !== raw.id) ? raw.id : newId();
        db[collection].push({
          id,
          ...item,
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
          updatedAt: now,
        });
        counts[collection] += 1;
      } catch (_) {
        /* gecersiz kaydi atla */
      }
    }
  }
  await saveDb();
  sendJson(res, 200, { ok: true, mode, counts });
});

route('POST', '/api/demo', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = demoData();
  for (const collection of Object.keys(data)) {
    db[collection] = db[collection].filter((x) => !x.demo);
    db[collection].push(...data[collection]);
  }
  await saveDb();
  sendJson(res, 200, { ok: true, data: publicData() });
});

route('DELETE', '/api/demo', async (req, res) => {
  if (!requireAuth(req, res)) return;
  for (const collection of ['backlinks', 'keywords', 'tasks', 'notes']) {
    db[collection] = db[collection].filter((x) => !x.demo);
  }
  await saveDb();
  sendJson(res, 200, { ok: true, data: publicData() });
});

/* ------------------------------------------------------------------ */
/* Statik dosyalar                                                    */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (_) {
    throw httpError(400, 'Gecersiz adres.');
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0') || rel.includes('..')) throw httpError(403, 'Erisim reddedildi.');
  let filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) throw httpError(403, 'Erisim reddedildi.');

  let stat = null;
  try {
    stat = await fsp.stat(filePath);
  } catch (_) {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    if (!path.extname(rel)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
      try {
        stat = await fsp.stat(filePath);
      } catch (_) {
        throw httpError(404, 'Sayfa bulunamadı.');
      }
    } else {
      throw httpError(404, 'Dosya bulunamadı.');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    ETag: etag,
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Istek yonlendirici                                                 */
/* ------------------------------------------------------------------ */

async function handleRequest(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );

  let parsed;
  try {
    parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    throw httpError(400, 'Gecersiz istek.');
  }
  const pathname = parsed.pathname;
  const method = req.method || 'GET';

  if (pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) {
      res.setHeader('Allow', 'GET, HEAD, POST, PUT, DELETE');
      throw httpError(405, 'Desteklenmeyen istek yontemi.');
    }
    if (method !== 'GET' && method !== 'HEAD') {
      if (!sameOriginOk(req)) throw httpError(403, 'Gecersiz istek kaynagi.');
      if (!pathname.startsWith('/api/')) throw httpError(403, 'Erisim reddedildi.');
    }
    for (const r of routes) {
      if (r.method !== method) continue;
      const match = r.regex.exec(pathname);
      if (!match) continue;
      const params = match.slice(1).map((p) => {
        try { return decodeURIComponent(p); } catch (_) { return p; }
      });
      await r.handler(req, res, params);
      return;
    }
    throw httpError(404, 'API adresi bulunamadı.');
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    throw httpError(405, 'Desteklenmeyen istek yontemi.');
  }
  await serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    const status = Number(err && err.status) || 500;
    if (status >= 500) console.error('[http]', req.method, req.url, err);
    if (!res.headersSent) {
      sendJson(res, status, { error: status >= 500 ? 'Sunucuda bir hata olustu.' : err.message });
    } else {
      try { res.end(); } catch (_) { /* yoksay */ }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Baslat                                                            */
/* ------------------------------------------------------------------ */

function localAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

async function start() {
  await loadDb();
  if (!isConfigured() && ENV_PASSWORD && ENV_PASSWORD.length < 6) {
    console.warn('[uyari] ADMIN_PASSWORD cok kisa (en az 6 karakter onerilir).');
  }
  server.listen(PORT, HOST, () => {
    const lines = [
      '',
      '  nargiledepom.com · SEO & Backlink Paneli',
      '  ----------------------------------------',
      `  Yerel:   http://localhost:${PORT}`,
    ];
    for (const ip of localAddresses()) lines.push(`  Ag:      http://${ip}:${PORT}   (telefondan ayni Wi-Fi ile)`);
    if (!isConfigured()) lines.push('', '  Ilk acilista panelden bir yonetici sifresi belirleyin.');
    if (ENV_PASSWORD) lines.push('', '  Giris sifresi ADMIN_PASSWORD ortam degiskeninden okunuyor.');
    lines.push('');
    console.log(lines.join('\n'));
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Kapatiliyor, veriler kaydediliyor...`);
  server.close();
  await saveDb();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Sunucu baslatilamadi:', err);
  process.exit(1);
});
