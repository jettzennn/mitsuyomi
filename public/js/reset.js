'use strict';
/* Mitsuyomi — halaman atur ulang kata sandi dari tautan email. */
(function resetPage() {
  const form = document.getElementById('resetForm');
  const errBox = document.getElementById('formErr');
  const token = new URLSearchParams(location.search).get('token') || '';

  function showErr(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }

  if (!token) {
    form.style.display = 'none';
    showErr('Tautan tidak lengkap. Buka tautan atur ulang dari email kamu, atau minta tautan baru.');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const password = document.getElementById('resetPassword').value;
    const password2 = document.getElementById('resetPassword2').value;
    if (password !== password2) { showErr('Ulangi kata sandi tidak sama.'); return; }
    const btn = document.getElementById('resetBtn');
    btn.textContent = 'Menyimpan…';
    btn.disabled = true;
    try {
      await apiPost('/api/auth/reset', { token, password });
      form.style.display = 'none';
      document.getElementById('resetDone').style.display = 'block';
    } catch (err) {
      showErr(err.message + (err.code === 'TOKEN_EXPIRED' ? ' Gunakan tautan "Minta tautan baru" di bawah.' : ''));
    } finally {
      btn.textContent = 'Simpan Kata Sandi';
      btn.disabled = false;
    }
  });
})();
