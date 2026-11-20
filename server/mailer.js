'use strict';
// Mitsuyomi — pengiriman email lewat Gmail SMTP (atau SMTP lain) tanpa
// dependensi tambahan: klien SMTP minimal di atas net/tls bawaan Node.
// Konfigurasi lewat .env: GMAIL_USER + GMAIL_APP_PASSWORD (App Password),
// atau SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS generik.
// Bila SMTP belum dikonfigurasi, email ditulis ke data/mail-outbox/ supaya
// alur tetap bisa diuji lokal (tautan juga ditampilkan di layar sebagai
// mode uji bila AUTH_SHOW_DEV_LINK=1).
const fs = require('fs');
const net = require('net');
const path = require('path');
const tls = require('tls');

function smtpConfig() {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const fromName = process.env.MAIL_FROM_NAME || 'Mitsuyomi';
  return { host, port, user, pass, from: user, fromHeader: `${fromName} <${user}>` };
}

function isConfigured() { return Boolean(smtpConfig()); }

// ---------- Klien SMTP minimal ----------
function smtpSession(socket) {
  let buffer = '';
  const waiters = [];
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        w.lines.push(line);
        // Respons SMTP selesai di baris "XYZ " (kode + spasi), bukan "XYZ-"
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
          waiters.splice(i, 1);
          const code = parseInt(line.slice(0, 3), 10);
          if (code >= 400) w.reject(new Error(`SMTP ${code}: ${w.lines.join(' | ')}`));
          else w.resolve(w.lines);
        }
      }
    }
  });
  return {
    read() { return new Promise((resolve, reject) => waiters.push({ lines: [], resolve, reject })); },
    async cmd(line) { const p = this.read(); socket.write(line + '\r\n'); return p; },
  };
}

async function smtpSend(cfg, to, subject, html, text) {
  const secure = cfg.port === 465;
  let socket = secure
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : net.connect({ host: cfg.host, port: cfg.port });
  await new Promise((resolve, reject) => {
    socket.once(secure ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
    setTimeout(() => reject(new Error('SMTP timeout')), 20000);
  });
  let session = smtpSession(socket);
  try {
    await session.read(); // sapaan 220
    if (!secure) {
      await session.cmd(`EHLO mitsuyomi.local`);
      await session.cmd('STARTTLS');
      socket = tls.connect({ socket, servername: cfg.host });
      await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
      session = smtpSession(socket);
      await session.cmd('EHLO mitsuyomi.local');
    } else {
      await session.cmd('EHLO mitsuyomi.local');
    }
    await session.cmd('AUTH LOGIN');
    await session.cmd(Buffer.from(cfg.user).toString('base64'));
    await session.cmd(Buffer.from(cfg.pass).toString('base64'));
    await session.cmd(`MAIL FROM:<${cfg.from}>`);
    await session.cmd(`RCPT TO:<${to}>`);
    await session.cmd('DATA');
    const boundary = 'myomi-' + Date.now().toString(36);
    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
    const msg = [
      `From: ${cfg.fromHeader}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      `--${boundary}--`,
      '.',
    ].join('\r\n');
    const p = session.read();
    socket.write(msg + '\r\n');
    await p;
    await session.cmd('QUIT').catch(() => {});
  } finally {
    try { socket.end(); } catch (_) {}
  }
}

// ---------- Template email (logo + tombol di tengah, gaya situs) ----------
function emailShell({ heading, intro, buttonLabel, url, outro }) {
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Mitsuyomi</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
  <tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#121212;border:1px solid #3a3a3a;">
      <tr><td align="center" style="padding:30px 24px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" valign="middle" style="background:#f4f1ea;color:#0a0a0a;font-family:Arial,sans-serif;font-size:30px;font-weight:bold;width:52px;height:52px;border-bottom:5px solid #ff4a1f;">M</td>
          <td style="padding-left:12px;font-family:Arial,sans-serif;font-size:30px;font-weight:bold;letter-spacing:1px;color:#f4f1ea;">MITSUYOMI<span style="color:#ff4a1f;">.</span></td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="padding:18px 32px 0;font-family:Arial,sans-serif;">
        <div style="font-size:24px;font-weight:bold;text-transform:uppercase;color:#f4f1ea;letter-spacing:.5px;">${heading}</div>
        <p style="font-size:15px;line-height:1.6;color:#c9c5ba;margin:14px 0 0;">${intro}</p>
      </td></tr>
      <tr><td align="center" style="padding:26px 24px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" style="background:#ff4a1f;">
            <a href="${url}" style="display:inline-block;padding:15px 38px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-decoration:none;text-transform:uppercase;">${buttonLabel}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="padding:16px 32px 28px;font-family:Arial,sans-serif;">
        <p style="font-size:13px;line-height:1.6;color:#9b968a;margin:0;">${outro}</p>
        <p style="font-size:12px;line-height:1.6;color:#6e6a60;margin:14px 0 0;word-break:break-all;">Tautan tidak bisa diklik? Salin alamat ini ke browser:<br><a href="${url}" style="color:#ff4a1f;">${url}</a></p>
      </td></tr>
    </table>
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#6e6a60;padding-top:16px;">Mitsuyomi — baca manga, manhwa &amp; manhua Bahasa Indonesia.</div>
  </td></tr>
</table>
</body></html>`;
}

function activationEmail(name, url) {
  return {
    subject: 'Aktivasi Akun Mitsuyomi — tautan berlaku 60 detik',
    html: emailShell({
      heading: 'Aktivasi Akun',
      intro: `Halo ${name}, satu langkah lagi! Tekan tombol di bawah untuk mengaktifkan akun Mitsuyomi-mu.`,
      buttonLabel: 'Aktivasi Akun',
      url,
      outro: 'Tautan ini hanya berlaku <b style="color:#f4f1ea;">60 detik</b>. Kalau sudah kedaluwarsa, minta tautan baru dari halaman masuk. Abaikan email ini bila kamu tidak merasa mendaftar.',
    }),
    text: `Halo ${name},\n\nAktifkan akun Mitsuyomi-mu lewat tautan ini (berlaku 60 detik):\n${url}\n\nAbaikan bila kamu tidak merasa mendaftar.`,
  };
}

function resetEmail(name, url) {
  return {
    subject: 'Atur Ulang Kata Sandi Mitsuyomi — tautan berlaku 60 detik',
    html: emailShell({
      heading: 'Atur Ulang Kata Sandi',
      intro: `Halo ${name}, kami menerima permintaan atur ulang kata sandi untuk akun Mitsuyomi-mu. Tekan tombol di bawah untuk membuat kata sandi baru.`,
      buttonLabel: 'Atur Ulang Kata Sandi',
      url,
      outro: 'Tautan ini hanya berlaku <b style="color:#f4f1ea;">60 detik</b>. Kalau kamu tidak meminta ini, abaikan saja — kata sandimu tidak berubah.',
    }),
    text: `Halo ${name},\n\nAtur ulang kata sandimu lewat tautan ini (berlaku 60 detik):\n${url}\n\nAbaikan bila kamu tidak meminta ini.`,
  };
}

// Kirim email. Mengembalikan { delivered: true } atau
// { delivered: false, devFile } bila SMTP belum dikonfigurasi / gagal
// (email disimpan ke data/mail-outbox supaya tetap bisa diuji).
async function sendMail(to, subject, html, text) {
  const cfg = smtpConfig();
  if (cfg) {
    try {
      await smtpSend(cfg, to, subject, html, text);
      return { delivered: true };
    } catch (err) {
      console.error('Gagal kirim email SMTP:', err.message);
    }
  }
  try {
    const dir = path.join(__dirname, '..', 'data', 'mail-outbox');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${String(to).replace(/[^\w.@-]/g, '_')}.html`);
    fs.writeFileSync(file, html, 'utf8');
    return { delivered: false, devFile: file };
  } catch (_) {
    return { delivered: false };
  }
}

module.exports = { sendMail, activationEmail, resetEmail, isConfigured };
