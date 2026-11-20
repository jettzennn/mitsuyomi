'use strict';
/* Mitsuyomi — halaman Akun */
(async function accountPage() {
  const area = document.getElementById('accountArea');
  try {
    const data = await apiGet('/api/auth/me');
    if (!data.user) {
      // Tamu: tab Masuk | Daftar BERDAMPINGAN — klik salah satu menampilkan
      // seluruh form-nya (bukan form yang ditumpuk atas-bawah).
      area.innerHTML = `
        <div class="auth-card account-card">
          <div class="msg-err" id="formErr" style="display:none"></div>
          <div class="auth-tabs" data-default-tab="masuk" role="tablist" aria-label="Masuk atau daftar">
            <button type="button" class="auth-tab active" data-tab="masuk">Masuk</button>
            <button type="button" class="auth-tab" data-tab="daftar">Daftar</button>
          </div>

          <div id="panelMasuk">
            <div class="msg-ok" id="loginInfo" style="display:none"></div>
            <form id="loginForm" novalidate>
              <div class="field">
                <label for="loginEmail">Email</label>
                <input type="email" id="loginEmail" autocomplete="email" placeholder="nama@gmail.com" required>
              </div>
              <div class="field">
                <label for="loginPassword">Kata Sandi</label>
                <div class="pw-wrap">
                  <input type="password" id="loginPassword" autocomplete="current-password" placeholder="Kata sandimu" required>
                  <button type="button" class="eye" aria-label="Tampilkan kata sandi"></button>
                </div>
              </div>
              <button class="btn acc auth-submit" type="submit" id="loginBtn">Masuk</button>
            </form>
            <div class="msg-ok" id="notActiveBox" style="display:none">
              Akunmu belum aktif. Klik tombol di bawah untuk mengirim ulang tautan aktivasi (berlaku 60 detik).
              <div class="resend-row">
                <button class="btn dark small" type="button" id="resendActivationBtn">Kirim Ulang Aktivasi</button>
                <span class="cd-note" id="resendCdNote" style="display:none">Tautan kedaluwarsa dalam <b id="resendCd">60</b> detik</span>
              </div>
              <div class="devlink-box" id="resendDevBox" style="display:none">Mode uji (SMTP belum tersambung):<br><a id="resendDevLink" href="#">Buka tautan aktivasi</a></div>
            </div>
            <div class="auth-links">
              <a href="/lupa-password">Lupa kata sandi?</a>
              <span>Belum punya akun? Klik tab <b>Daftar</b>.</span>
            </div>
          </div>

          <div id="panelDaftar" style="display:none">
            <form id="registerForm" novalidate>
              <div class="field">
                <label for="regName">Nama</label>
                <input type="text" id="regName" autocomplete="name" placeholder="Namamu" required>
              </div>
              <div class="field">
                <label for="regEmail">Email (Gmail)</label>
                <input type="email" id="regEmail" autocomplete="email" placeholder="nama@gmail.com" required>
              </div>
              <div class="cd-note" style="margin:-8px 0 14px;text-align:left">Wajib <b>@gmail.com</b> dan Gmail yang aktif — domain lain ditolak. Tautan verifikasi dikirim ke Gmail itu.</div>
              <div class="field">
                <label for="regPassword">Kata Sandi</label>
                <div class="pw-wrap">
                  <input type="password" id="regPassword" autocomplete="new-password" placeholder="Minimal 8 karakter" required>
                  <button type="button" class="eye" aria-label="Tampilkan kata sandi"></button>
                </div>
              </div>
              <div class="field">
                <label for="regPassword2">Ulangi Kata Sandi</label>
                <div class="pw-wrap">
                  <input type="password" id="regPassword2" autocomplete="new-password" placeholder="Ketik ulang kata sandi" required>
                  <button type="button" class="eye" aria-label="Tampilkan kata sandi"></button>
                </div>
              </div>
              <button class="btn acc auth-submit" type="submit" id="registerBtn">Daftar</button>
            </form>

            <div id="pendingPanel" style="display:none">
              <div class="msg-ok">
                <b>Pendaftaran diterima!</b><br>
                Kami mengirim <b>tautan aktivasi</b> ke email kamu (bukan kode — cukup tekan tombol di email). Cek juga folder Spam/Promosi di Gmail.
              </div>
              <div class="cd-wrap">
                <div class="countdown" id="regCd">60</div>
                <div class="cd-note">detik tersisa sebelum tautan aktivasi kedaluwarsa</div>
              </div>
              <div class="devlink-box" id="regDevBox" style="display:none">Mode uji (SMTP belum tersambung):<br><a id="regDevLink" href="#">Buka tautan aktivasi sekarang</a></div>
              <div class="resend-row">
                <button class="btn dark small" type="button" id="resendRegBtn" disabled>Kirim Ulang Tautan</button>
                <span class="cd-note">Tombol aktif lagi setelah hitung mundur selesai.</span>
              </div>
              <button class="btn dark auth-submit" type="button" id="toLoginBtn" style="margin-top:14px">Ke Form Masuk</button>
              <div class="cd-note" style="margin-top:10px">Setelah aktivasi dari Gmail, masuk lewat tab Masuk — emailmu terisi otomatis, tinggal kata sandi. Kamu tidak otomatis masuk setelah daftar.</div>
            </div>

            <div class="auth-links">
              <span>Sudah punya akun? Klik tab <b>Masuk</b>.</span>
            </div>
          </div>
        </div>`;
      initPwToggles(area);
      if (window.initAuthForms) window.initAuthForms();
      return;
    }
    const u = data.user;
    const initial = esc((u.name || 'M').trim().charAt(0).toUpperCase() || 'M');
    area.innerHTML = `
      <div class="auth-card account-card">
        <div class="account-head">
          <div class="avatar">${initial}</div>
          <div>
            <div class="account-name">${esc(u.name)}</div>
            <div class="account-email">${esc(u.email)}</div>
            <span class="sticker">Member aktif</span>
          </div>
        </div>
        <p class="auth-note">Konten kategori dewasa sekarang terbuka untuk akunmu. Bookmark & riwayat baca tetap tersimpan di perangkat ini lewat menu Koleksi.</p>
        <div class="detail-actions">
          <a class="btn acc" href="/koleksi">Koleksi Saya</a>
          <a class="btn dark" href="/jelajahi">Jelajahi Komik</a>
          <button class="btn dark" type="button" id="logoutBtn">Keluar</button>
        </div>
      </div>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await apiPost('/api/auth/logout', {}); } catch (_) {}
      location.reload();
    });
  } catch (err) {
    area.innerHTML = errHtml(err.message);
  }
})();
