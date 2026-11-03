import { api } from '../api.js';
import { icons } from '../icons.js';
import {
  esc, fmtNum, fmtDate, confirmAction, formToObject, todayIso,
} from '../ui.js';

export function render(container, ctx) {
  const data = ctx.data || {};
  const backlinks = data.backlinks || [];
  const keywords = data.keywords || [];
  const tasks = data.tasks || [];
  const notes = data.notes || [];
  const total = backlinks.length + keywords.length + tasks.length + notes.length;
  const demoCount = [...backlinks, ...keywords, ...tasks, ...notes].filter((x) => x.demo).length;

  container.innerHTML = `<div class="page">
    <div class="settings-grid">
      <section class="card settings-card">
        <h3 class="settings-card__title">${icons.lock} Giriş şifresi</h3>
        <p class="settings-card__sub">Panel tek yönetici şifresiyle korunur. Telefon, tablet ve bilgisayardan aynı şifreyle giriş yapabilirsin.</p>
        ${ctx.envPassword
          ? `<div class="auth__error show" style="font-size:12px">Şifre sunucudaki <strong>ADMIN_PASSWORD</strong> ortam değişkeniyle yönetiliyor. Değiştirmek için sunucu ayarını güncelleyip yeniden başlat.</div>`
          : `<form id="pw-form" novalidate>
              <div class="form-grid">
                <div class="field span-2">
                  <label for="pw-current">Mevcut şifre</label>
                  <input type="password" id="pw-current" name="current" autocomplete="current-password" placeholder="Mevcut şifren" required />
                </div>
                <div class="field">
                  <label for="pw-next">Yeni şifre</label>
                  <input type="password" id="pw-next" name="next" autocomplete="new-password" placeholder="En az 6 karakter" required />
                </div>
                <div class="field">
                  <label for="pw-next2">Yeni şifre (tekrar)</label>
                  <input type="password" id="pw-next2" name="next2" autocomplete="new-password" placeholder="Yeni şifreyi tekrar yaz" required />
                </div>
              </div>
              <div class="settings-actions" style="margin-top:13px">
                <button type="submit" class="btn btn--primary" id="pw-submit">Şifreyi güncelle</button>
              </div>
            </form>`}
      </section>

      <section class="card settings-card">
        <h3 class="settings-card__title">${icons.download} Yedekleme</h3>
        <p class="settings-card__sub">Veriler sunucuda saklanır. Düzenli olarak yedek indirmen, olası bir sorunda kayıtlarını korur.</p>
        <div class="settings-actions">
          <a class="btn btn--soft" href="/api/export/all" download>${icons.database} JSON yedek</a>
          <a class="btn btn--ghost" href="/api/export/backlinks.csv" download>${icons.download} Backlink CSV</a>
          <a class="btn btn--ghost" href="/api/export/keywords.csv" download>${icons.download} Sıralama CSV</a>
        </div>
        <div class="meta-list" style="margin-top:12px">
          <div class="meta-row"><span>Backlink</span><strong>${fmtNum(backlinks.length)} kayıt</strong></div>
          <div class="meta-row"><span>Anahtar kelime</span><strong>${fmtNum(keywords.length)} kayıt</strong></div>
          <div class="meta-row"><span>Görev / Not</span><strong>${fmtNum(tasks.length)} / ${fmtNum(notes.length)}</strong></div>
        </div>
      </section>

      <section class="card settings-card">
        <h3 class="settings-card__title">${icons.upload} Yedekten geri yükle</h3>
        <p class="settings-card__sub">Daha önce indirdiğin JSON yedeğini yükle. Birleştir veya mevcut kayıtların üzerine yaz.</p>
        <label class="file-drop" for="import-file">
          ${icons.file}
          <input type="file" id="import-file" accept="application/json,.json" />
          <div class="file-drop__text">
            <strong id="import-name">JSON yedek dosyası seç</strong>
            <span>veya dosyayı buraya bırak</span>
          </div>
        </label>
        <div class="field" style="margin-top:12px">
          <label for="import-mode">Aktarım modu</label>
          <select id="import-mode">
            <option value="merge">Birleştir (mevcut kayıtlar korunur)</option>
            <option value="replace">Değiştir (mevcut kayıtlar silinir)</option>
          </select>
        </div>
        <div class="settings-actions" style="margin-top:12px">
          <button type="button" class="btn btn--primary" id="import-btn" disabled>${icons.upload} Geri yükle</button>
        </div>
      </section>

      <section class="card settings-card">
        <h3 class="settings-card__title">${icons.sparkles} Demo verisi</h3>
        <p class="settings-card__sub">Paneli örnek backlink, anahtar kelime, görev ve notlarla doldurarak inceleyebilirsin. Demo kayıtları daha sonra tek tıkla temizlenir.</p>
        <div class="settings-actions">
          <button type="button" class="btn btn--soft" id="demo-load">Demo verisi yükle</button>
          <button type="button" class="btn btn--ghost" id="demo-clear" ${demoCount ? '' : 'disabled'}>${icons.trash} Demo verilerini temizle</button>
        </div>
        <div class="meta-list" style="margin-top:12px">
          <div class="meta-row"><span>Demo kayıt</span><strong>${fmtNum(demoCount)}</strong></div>
          <div class="meta-row"><span>Toplam kayıt</span><strong>${fmtNum(total)}</strong></div>
        </div>
      </section>

      <section class="card settings-card">
        <h3 class="settings-card__title">${icons.info} Panel bilgileri</h3>
        <p class="settings-card__sub">Bu panel nargiledepom.com SEO çalışmalarını tek yerden takip etmek için hazırlandı.</p>
        <div class="meta-list">
          <div class="meta-row"><span>Site</span><strong><a href="https://nargiledepom.com" target="_blank" rel="noopener">nargiledepom.com ${icons.external}</a></strong></div>
          <div class="meta-row"><span>Sürüm</span><strong>1.0.0</strong></div>
          <div class="meta-row"><span>Depolama</span><strong>Sunucu · data/db.json</strong></div>
          <div class="meta-row"><span>Oturum süresi</span><strong>30 gün</strong></div>
          <div class="meta-row"><span>Bugün</span><strong>${esc(fmtDate(todayIso()))}</strong></div>
        </div>
      </section>

      <section class="card settings-card danger-zone">
        <h3 class="settings-card__title">${icons.logout} Oturum</h3>
        <p class="settings-card__sub">Bu cihazdaki oturumu kapat. Veriler sunucuda güvende kalır; diğer cihazlardaki oturumlar etkilenmez.</p>
        <div class="settings-actions">
          <button type="button" class="btn btn--danger" data-logout>${icons.logout} Çıkış yap</button>
        </div>
      </section>
    </div>
  </div>`;

  /* Şifre değiştirme */
  const pwForm = container.querySelector('#pw-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = formToObject(new FormData(pwForm));
      if (!values.current) return ctx.toast('Mevcut şifreyi girin.', 'error');
      if (!values.next || values.next.length < 6) return ctx.toast('Yeni şifre en az 6 karakter olmalı.', 'error');
      if (values.next !== values.next2) return ctx.toast('Yeni şifreler eşleşmiyor.', 'error');

      const submit = container.querySelector('#pw-submit');
      submit.disabled = true;
      try {
        await api.post('/api/settings/password', { current: values.current, next: values.next });
        ctx.toast('Şifre güncellendi. Diğer cihazlardaki oturumlar kapatıldı.');
        pwForm.reset();
      } catch (err) {
        ctx.toast(err.message || 'Şifre güncellenemedi.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
  }

  /* Demo verisi */
  const demoLoad = container.querySelector('#demo-load');
  const demoClear = container.querySelector('#demo-clear');

  demoLoad.addEventListener('click', async () => {
    if (demoCount) {
      const ok = await confirmAction({
        title: 'Demo verisi yenilensin mi?',
        message: 'Mevcut demo kayıtları silinip yeniden oluşturulacak. Kendi kayıtların korunur.',
        confirmText: 'Yenile',
        danger: false,
      });
      if (!ok) return;
    }
    demoLoad.disabled = true;
    try {
      await api.post('/api/demo');
      ctx.toast('Demo verisi yüklendi.');
      await ctx.refresh();
    } catch (err) {
      ctx.toast(err.message || 'Demo verisi yüklenemedi.', 'error');
      demoLoad.disabled = false;
    }
  });

  demoClear.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Demo verileri silinsin mi?',
      message: 'Sadece demo olarak eklenen kayıtlar silinir. Kendi girdiğin veriler korunur.',
      confirmText: 'Temizle',
    });
    if (!ok) return;
    try {
      await api.del('/api/demo');
      ctx.toast('Demo verileri temizlendi.');
      await ctx.refresh();
    } catch (err) {
      ctx.toast(err.message || 'Temizlenemedi.', 'error');
    }
  });

  /* Yedekten geri yükleme */
  const fileInput = container.querySelector('#import-file');
  const fileName = container.querySelector('#import-name');
  const importMode = container.querySelector('#import-mode');
  const importBtn = container.querySelector('#import-btn');
  let importPayload = null;
  let importLabel = '';

  fileInput.addEventListener('change', async () => {
    importPayload = null;
    importBtn.disabled = true;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const hasData = ['backlinks', 'keywords', 'tasks', 'notes'].some((key) => Array.isArray(parsed[key]));
      if (!parsed || typeof parsed !== 'object' || !hasData) {
        throw new Error('Dosya geçerli bir panel yedeği değil.');
      }
      importPayload = parsed;
      importLabel = file.name;
      fileName.textContent = file.name;
      importBtn.disabled = false;
    } catch (err) {
      fileName.textContent = 'JSON yedek dosyası seç';
      fileInput.value = '';
      ctx.toast(err.message || 'Dosya okunamadı.', 'error');
    }
  });

  importBtn.addEventListener('click', async () => {
    if (!importPayload) return;
    const mode = importMode.value;
    if (mode === 'replace') {
      const ok = await confirmAction({
        title: 'Mevcut veriler değiştirilsin mi?',
        message: 'Mevcut tüm backlink, kelime, görev ve not kayıtları silinip yedekteki veriler yüklenecek. Bu işlem geri alınamaz.',
        confirmText: 'Değiştir',
      });
      if (!ok) return;
    }

    importBtn.disabled = true;
    try {
      const res = await api.post('/api/import', { mode, payload: importPayload });
      const counts = res.counts || {};
      const added = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
      ctx.toast(`${importLabel} aktarıldı · ${added} kayıt işlendi.`);
      await ctx.refresh();
    } catch (err) {
      ctx.toast(err.message || 'Yedek yüklenemedi.', 'error');
      importBtn.disabled = false;
    }
  });

  /* Çıkış */
  container.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.logout());
  });
}
