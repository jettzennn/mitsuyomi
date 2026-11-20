'use strict';
/* Mitsuyomi — formulir Masuk / Daftar / Lupa Kata Sandi.
   Masuk & Daftar tampil sebagai dua tab BERDAMPINGAN: klik "Masuk"
   menampilkan seluruh form masuk, klik "Daftar" menampilkan seluruh
   form daftar. Aktivasi & atur ulang memakai TAUTAN (bukan kode) yang
   berlaku 60 detik, lengkap dengan hitung mundur di layar.
   Fungsi initAuthForms() bisa dipanggil ulang (halaman Akun merender
   formulirnya saat itu juga). */
function initAuthForms() {
  const errBox = document.getElementById('formErr');
  function showErr(msg) {
    if (!errBox) return;
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }
  function hideErr() { if (errBox) errBox.style.display = 'none'; }

  /* ---------- Tab Masuk | Daftar (berdampingan) ---------- */
  const tabWrap = document.querySelector('.auth-tabs');
  if (tabWrap && !tabWrap.dataset.bound) {
    tabWrap.dataset.bound = '1';
    const tabs = tabWrap.querySelectorAll('[data-tab]');
    const panels = {
      masuk: document.getElementById('panelMasuk'),
      daftar: document.getElementById('panelDaftar'),
    };
    const switchTab = (name) => {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
      if (panels.masuk) panels.masuk.style.display = name === 'masuk' ? 'block' : 'none';
      if (panels.daftar) panels.daftar.style.display = name === 'daftar' ? 'block' : 'none';
    };
    window.__myomiSwitchTab = switchTab;
    tabs.forEach((b) => b.addEventListener('click', () => { hideErr(); switchTab(b.dataset.tab); }));
    const wanted = new URLSearchParams(location.search).get('tab') || tabWrap.dataset.defaultTab || 'masuk';
    switchTab(wanted === 'daftar' ? 'daftar' : 'masuk');
  }

  /* ---------- Masuk ---------- */
  const loginForm = document.getElementById('loginForm');
  if (loginForm && !loginForm.dataset.bound) {
    loginForm.dataset.bound = '1';
    // Datang dari daftar/aktivasi: email sudah terisi, tinggal kata sandi.
    const loginParams = new URLSearchParams(location.search);
    const prefillEmail = loginParams.get('email') || '';
    if (prefillEmail) {
      document.getElementById('loginEmail').value = prefillEmail;
      const pw = document.getElementById('loginPassword');
      if (pw) pw.focus();
    }
    const infoBox = document.getElementById('loginInfo');
    if (infoBox && loginParams.get('activated')) {
      infoBox.innerHTML = '<b>Akunmu sudah aktif.</b><br>Email sudah terisi — tinggal masukkan kata sandi untuk masuk.';
      infoBox.style.display = 'block';
    } else if (infoBox && loginParams.get('registered')) {
      infoBox.innerHTML = '<b>Pendaftaran diterima.</b><br>Aktifkan dulu akunmu lewat tautan di Gmail, lalu masuk di sini — email sudah terisi, tinggal kata sandi.';
      infoBox.style.display = 'block';
    }
    const notActiveBox = document.getElementById('notActiveBox');
    let lastEmail = '';
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr();
      if (notActiveBox) notActiveBox.style.display = 'none';
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      lastEmail = email;
      const btn = document.getElementById('loginBtn');
      btn.textContent = 'Memproses…';
      btn.disabled = true;
      try {
        await apiPost('/api/auth/login', { email, password });
        const next = new URLSearchParams(location.search).get('next');
        location.href = next && next.startsWith('/') ? next : '/akun';
      } catch (err) {
        showErr(err.message);
        if (err.code === 'NOT_ACTIVE' && notActiveBox) notActiveBox.style.display = 'block';
      } finally {
        btn.textContent = 'Masuk';
        btn.disabled = false;
      }
    });

    const resendBtn = document.getElementById('resendActivationBtn');
    if (resendBtn && !resendBtn.dataset.bound) {
      resendBtn.dataset.bound = '1';
      resendBtn.addEventListener('click', async () => {
        hideErr();
        const email = (document.getElementById('loginEmail').value || lastEmail).trim();
        if (!email) { showErr('Isi email dulu untuk kirim ulang aktivasi.'); return; }
        resendBtn.disabled = true;
        try {
          const data = await apiPost('/api/auth/resend-activation', { email });
          if (data.alreadyActive) { showErr('Akun ini sudah aktif. Silakan masuk.'); return; }
          const note = document.getElementById('resendCdNote');
          const cdEl = document.getElementById('resendCd');
          if (note && cdEl) {
            note.style.display = 'inline';
            startCountdown(cdEl, data.expiresIn || 60, () => { note.style.display = 'none'; });
          }
          const devBox = document.getElementById('resendDevBox');
          const devLink = document.getElementById('resendDevLink');
          if (data.devLink && devBox && devLink) { devLink.href = data.devLink; devBox.style.display = 'block'; }
          resendBtn.textContent = 'Tautan Terkirim ✓';
        } catch (err) {
          showErr(err.message);
        } finally {
          setTimeout(() => { resendBtn.disabled = false; resendBtn.textContent = 'Kirim Ulang Aktivasi'; }, 1500);
        }
      });
    }
  }

  /* ---------- Daftar ---------- */
  const registerForm = document.getElementById('registerForm');
  if (registerForm && !registerForm.dataset.bound) {
    registerForm.dataset.bound = '1';
    let regEmail = '';
    let stopCd = () => {};
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const password2 = document.getElementById('regPassword2').value;
      if (!/^[^\s@]+@gmail\.com$/i.test(email)) { showErr('Email harus memakai domain @gmail.com — domain lain ditolak.'); return; }
      if (password !== password2) { showErr('Ulangi kata sandi tidak sama.'); return; }
      regEmail = email;
      const btn = document.getElementById('registerBtn');
      btn.textContent = 'Memproses…';
      btn.disabled = true;
      try {
        const data = await apiPost('/api/auth/register', { name, email, password });
        showPending(data);
      } catch (err) {
        showErr(err.message);
      } finally {
        btn.textContent = 'Daftar';
        btn.disabled = false;
      }
    });

    function showPending(data) {
      registerForm.style.display = 'none';
      const panel = document.getElementById('pendingPanel');
      panel.style.display = 'block';
      const devBox = document.getElementById('regDevBox');
      const devLink = document.getElementById('regDevLink');
      if (data.devLink && devBox && devLink) { devLink.href = data.devLink; devBox.style.display = 'block'; }
      const resendBtn = document.getElementById('resendRegBtn');
      resendBtn.disabled = true;
      stopCd();
      stopCd = startCountdown(document.getElementById('regCd'), data.expiresIn || 60, () => { resendBtn.disabled = false; });
    }

    const resendRegBtn = document.getElementById('resendRegBtn');
    if (resendRegBtn && !resendRegBtn.dataset.bound) {
      resendRegBtn.dataset.bound = '1';
      resendRegBtn.addEventListener('click', async () => {
        hideErr();
        try {
          const data = await apiPost('/api/auth/resend-activation', { email: regEmail });
          if (data.alreadyActive) { showErr('Akun ini sudah aktif. Silakan masuk.'); return; }
          showPending(data);
        } catch (err) { showErr(err.message); }
      });
    }

    // Setelah daftar: pindah ke tab Masuk (email terisi otomatis), bukan
    // otomatis masuk — akun harus diaktivasi dulu dari Gmail.
    const toLoginBtn = document.getElementById('toLoginBtn');
    if (toLoginBtn && !toLoginBtn.dataset.bound) {
      toLoginBtn.dataset.bound = '1';
      toLoginBtn.addEventListener('click', () => {
        if (window.__myomiSwitchTab) {
          window.__myomiSwitchTab('masuk');
          const emailEl = document.getElementById('loginEmail');
          if (emailEl && regEmail) emailEl.value = regEmail;
          const infoBox = document.getElementById('loginInfo');
          if (infoBox) {
            infoBox.innerHTML = '<b>Pendaftaran diterima.</b><br>Aktifkan dulu akunmu lewat tautan di Gmail, lalu masuk di sini — email sudah terisi, tinggal kata sandi.';
            infoBox.style.display = 'block';
          }
          const pw = document.getElementById('loginPassword');
          if (pw) pw.focus();
        } else {
          location.href = `/masuk?registered=1&email=${encodeURIComponent(regEmail)}`;
        }
      });
    }
  }

  /* ---------- Lupa kata sandi ---------- */
  const forgotForm = document.getElementById('forgotForm');
  if (forgotForm && !forgotForm.dataset.bound) {
    forgotForm.dataset.bound = '1';
    let fEmail = '';
    let stopCd = () => {};
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErr();
      const email = document.getElementById('forgotEmail').value.trim();
      fEmail = email;
      const btn = document.getElementById('forgotBtn');
      btn.textContent = 'Mengirim…';
      btn.disabled = true;
      try {
        const data = await apiPost('/api/auth/forgot', { email });
        showForgot(data);
      } catch (err) {
        showErr(err.message);
      } finally {
        btn.textContent = 'Kirim Tautan';
        btn.disabled = false;
      }
    });

    function showForgot(data) {
      forgotForm.style.display = 'none';
      const panel = document.getElementById('forgotPanel');
      panel.style.display = 'block';
      const devBox = document.getElementById('forgotDevBox');
      const devLink = document.getElementById('forgotDevLink');
      if (data.devLink && devBox && devLink) { devLink.href = data.devLink; devBox.style.display = 'block'; }
      const resendBtn = document.getElementById('resendForgotBtn');
      resendBtn.disabled = true;
      stopCd();
      stopCd = startCountdown(document.getElementById('forgotCd'), data.expiresIn || 60, () => { resendBtn.disabled = false; });
    }

    const resendForgotBtn = document.getElementById('resendForgotBtn');
    if (resendForgotBtn && !resendForgotBtn.dataset.bound) {
      resendForgotBtn.dataset.bound = '1';
      resendForgotBtn.addEventListener('click', async () => {
        hideErr();
        try {
          const data = await apiPost('/api/auth/forgot', { email: fEmail });
          showForgot(data);
        } catch (err) { showErr(err.message); }
      });
    }
  }
}
window.initAuthForms = initAuthForms;
initAuthForms();
