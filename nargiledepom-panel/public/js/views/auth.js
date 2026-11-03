import { api } from '../api.js';
import { icons } from '../icons.js';
import { esc } from '../ui.js';

export function renderAuth(app, boot, onSuccess) {
  const setup = !boot.configured;

  app.innerHTML = `<div class="auth">
    <div class="auth__bg"></div>
    <div class="auth__card">
      <div class="auth__brand">
        <div class="brand__mark">N</div>
        <div class="brand__text">
          <div class="brand__name">nargiledepom.com</div>
          <div class="brand__sub">SEO &amp; Backlink Paneli</div>
        </div>
      </div>

      <h1 class="auth__title">${setup ? 'Paneli kur' : 'Tekrar hoş geldin'}</h1>
      <p class="auth__sub">
        ${setup
          ? 'Panelin ilk kurulumu. Yönetici şifreni belirle; tüm cihazlardan aynı şifreyle giriş yapacaksın.'
          : 'SEO ve backlink çalışmalarına kaldığın yerden devam et.'}
      </p>

      <form class="auth__form" id="auth-form" novalidate>
        <div class="auth__error" id="auth-error" role="alert"></div>

        <div class="field">
          <label for="password">${setup ? 'Yeni şifre' : 'Şifre'}</label>
          <div class="password-wrap">
            <input type="password" id="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}"
              placeholder="${setup ? 'En az 6 karakter' : 'Şifreni gir'}" required />
            <button type="button" class="password-toggle" data-toggle-pw="password" aria-label="Şifreyi göster">${icons.eye}</button>
          </div>
          ${boot.envPassword ? '<span class="field__hint">Şifre sunucudaki ADMIN_PASSWORD ayarından yönetiliyor.</span>' : ''}
        </div>

        ${setup ? `<div class="field">
          <label for="password2">Şifre (tekrar)</label>
          <div class="password-wrap">
            <input type="password" id="password2" name="password2" autocomplete="new-password" placeholder="Şifreyi tekrar yaz" required />
            <button type="button" class="password-toggle" data-toggle-pw="password2" aria-label="Şifreyi göster">${icons.eye}</button>
          </div>
        </div>` : ''}

        <button type="submit" class="btn btn--primary btn--lg btn--block" id="auth-submit">
          ${setup ? 'Şifreyi oluştur ve giriş yap' : 'Giriş yap'}
        </button>
      </form>

      <div class="auth__foot">
        <span style="display:inline-flex;align-items:center;gap:5px">${icons.lock} 30 gün açık oturum</span>
        <a href="https://nargiledepom.com" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px">
          Siteyi aç ${icons.external}
        </a>
      </div>
    </div>
  </div>`;

  const form = app.querySelector('#auth-form');
  const errorBox = app.querySelector('#auth-error');
  const submit = app.querySelector('#auth-submit');

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  };

  app.querySelectorAll('[data-toggle-pw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = app.querySelector(`#${btn.dataset.togglePw}`);
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.innerHTML = reveal ? icons.eyeOff : icons.eye;
      btn.setAttribute('aria-label', reveal ? 'Şifreyi gizle' : 'Şifreyi göster');
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.remove('show');

    const password = form.password.value;
    const password2 = form.password2 ? form.password2.value : '';

    if (setup) {
      if (password.length < 6) return showError('Şifre en az 6 karakter olmalı.');
      if (password !== password2) return showError('Şifreler birbiriyle eşleşmiyor.');
    } else if (!password) {
      return showError('Şifreni gir.');
    }

    submit.disabled = true;
    submit.textContent = setup ? 'Kuruluyor…' : 'Giriş yapılıyor…';

    try {
      const res = setup
        ? await api.post('/api/setup', { password })
        : await api.post('/api/login', { password });
      onSuccess(res.data);
    } catch (err) {
      showError(err.message || 'Giriş yapılamadı.');
      submit.disabled = false;
      submit.textContent = setup ? 'Şifreyi oluştur ve giriş yap' : 'Giriş yap';
    }
  });

  setTimeout(() => {
    const input = app.querySelector('#password');
    if (input && window.innerWidth >= 700) input.focus();
  }, 50);
}
