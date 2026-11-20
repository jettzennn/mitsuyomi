'use strict';
/* Mitsuyomi — halaman aktivasi: memeriksa token dari tautan email. */
(async function activatePage() {
  const area = document.getElementById('activateArea');
  const token = new URLSearchParams(location.search).get('token') || '';

  function resendHtml() {
    return `
      <div class="msg-err" id="actErr" style="display:none"></div>
      <form id="resendActForm">
        <p class="auth-note">Minta tautan baru — masukkan email pendaftaranmu. Tautan baru juga berlaku <b>60 detik</b>.</p>
        <div class="field">
          <label for="actEmail">Email</label>
          <input type="email" id="actEmail" autocomplete="email" placeholder="nama@email.com" required>
        </div>
        <button class="btn acc auth-submit" type="submit">Kirim Tautan Baru</button>
      </form>
      <div id="actSent" style="display:none">
        <div class="msg-ok"><b>Tautan baru terkirim!</b><br>Cek email kamu sekarang.</div>
        <div class="cd-wrap">
          <div class="countdown" id="actCd">60</div>
          <div class="cd-note">detik tersisa sebelum tautan kedaluwarsa</div>
        </div>
        <div class="devlink-box" id="actDevBox" style="display:none">Mode uji (SMTP belum tersambung):<br><a id="actDevLink" href="#">Buka tautan aktivasi sekarang</a></div>
      </div>`;
  }

  function bindResend() {
    const form = document.getElementById('resendActForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('actErr');
      const email = document.getElementById('actEmail').value.trim();
      try {
        const data = await apiPost('/api/auth/resend-activation', { email });
        if (data.alreadyActive) {
          area.innerHTML = `<div class="msg-ok"><b>Akun sudah aktif.</b><br>Silakan masuk.</div><a class="btn acc auth-submit" href="/masuk">Masuk</a>`;
          return;
        }
        form.style.display = 'none';
        const sent = document.getElementById('actSent');
        sent.style.display = 'block';
        if (data.devLink) {
          document.getElementById('actDevLink').href = data.devLink;
          document.getElementById('actDevBox').style.display = 'block';
        }
        startCountdown(document.getElementById('actCd'), data.expiresIn || 60, null);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  }

  if (!token) {
    area.innerHTML = `<div class="msg-err"><b>Tautan tidak lengkap.</b><br>Buka tautan aktivasi dari email kamu.</div>` + resendHtml();
    bindResend();
    return;
  }

  try {
    const data = await apiGet(`/api/auth/activate?token=${encodeURIComponent(token)}`);
    const loginHref = `/masuk?activated=1${data.email ? `&email=${encodeURIComponent(data.email)}` : ''}`;
    area.innerHTML = `
      <div class="msg-ok"><b>Akun aktif!</b><br>Selamat datang di Mitsuyomi. Kamu diarahkan ke halaman masuk — emailmu sudah terisi, tinggal ketik kata sandi.</div>
      <a class="btn acc auth-submit" href="${loginHref}">Masuk Sekarang</a>`;
  } catch (err) {
    const expired = err.code === 'TOKEN_EXPIRED';
    area.innerHTML = `
      <div class="msg-err"><b>${expired ? 'Tautan kedaluwarsa.' : 'Tautan tidak valid.'}</b><br>${esc(err.message)}</div>
      ${resendHtml()}`;
    bindResend();
  }
})();
