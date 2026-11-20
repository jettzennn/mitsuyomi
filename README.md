<div align="center">

# Mitsuyomi

**Website baca manga, manhwa, dan manhua — cepat, gelap, dan nyaman dibaca di HP.**

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.5-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Dependensi](https://img.shields.io/badge/dependensi-0-success)
![Versi](https://img.shields.io/badge/versi-1.4.1-orange)

</div>

---

## Tentang

Mitsuyomi adalah aplikasi web baca komik full-stack yang dibangun dengan **Node.js murni tanpa satu pun dependensi npm** dan **SQLite** sebagai basis data. Seluruh konten diambil dari layanan data komik eksternal, disimpan dalam cache lokal agar hemat kuota dan cepat dibuka, lalu disajikan dengan tampilan gelap total beraksen oranye yang dirancang mobile-first.

## Fitur

### Baca Komik
- **Beranda lengkap** — rilis terbaru, komik populer, top komik, dan rekomendasi dalam satu halaman.
- **Pencarian akurat** — hasil diurutkan judul utama terlebih dahulu, lengkap dengan riwayat pencarian (maks. 8, bisa dihapus satu per satu atau semua).
- **Jelajahi genre** — 49 genre publik; genre khusus member disembunyikan dan terkunci untuk tamu.
- **Kartu seragam** — setiap komik selalu menampilkan label tipe berbendera (🇯🇵 Manga · 🇰🇷 Manhwa · 🇨🇳 Manhua) dan lencana rating.
- **Halaman detail** — sinopsis, metadata lengkap, filter & urutan chapter, bookmark, dan tombol lanjut baca.
- **Reader vertikal** — gambar dimuat progresif, bilah progres baca, navigasi keyboard, tombol chapter sebelumnya/berikutnya.
- **Koleksi pribadi** — bookmark dan riwayat baca tersimpan di perangkat (localStorage).

### Akun
- Daftar khusus alamat **@gmail.com**, aktivasi lewat tautan email (berlaku 60 detik, sekali pakai, dengan hitung mundur di layar).
- Masuk, lupa kata sandi, dan atur ulang kata sandi dengan alur tautan yang sama.
- Kata sandi ter-hash (scrypt), sesi login 30 hari, formulir Masuk/Daftar sebagai dua tab berdampingan.
- Email ber-template resmi dengan logo dan tombol di tengah; selama SMTP belum disambungkan, email masuk ke folder outbox lokal dan tautan uji tampil di layar.

### Teknis
- **Nol dependensi** — hanya memakai modul bawaan Node.js, termasuk `node:sqlite`.
- **Cache SQLite + antrean serial** — panggilan ke layanan data dijaga berjeda agar tidak melewati batas laju API.
- **Indeks metadata silang** — rating dan tipe saling dilengkapi antardaftar dari data detail yang pernah dimuat.
- **Keamanan** — header keamanan, rate limit per IP, token aktivasi/reset ter-hash dan sekali pakai.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Runtime | Node.js ≥ 22.5 |
| Server | HTTP bawaan Node.js (tanpa framework) |
| Basis data | SQLite via `node:sqlite` |
| Frontend | HTML, CSS, JavaScript vanilla |
| Email | SMTP tulisan sendiri (nol dependensi), Gmail App Password |

## Struktur Proyek

```
mitsuyomi/
├── server/
│   ├── server.js      # server HTTP, rute, keamanan
│   ├── api.js         # klien layanan data + antrean laju
│   ├── cache.js       # cache SQLite + indeks metadata
│   ├── normalize.js   # normalisasi data komik
│   ├── auth.js        # akun, token, sesi
│   ├── mailer.js      # pengiriman email SMTP
│   └── db/schema.sql  # skema basis data
├── public/            # halaman, CSS, JavaScript, ikon
├── data/              # basis data dibuat otomatis di sini
├── scripts/           # perkakas pemeriksaan
├── .env.example       # contoh konfigurasi
└── package.json
```

## Menjalankan

**Prasyarat:** Node.js versi 22.5 atau lebih baru.

```bash
git clone https://github.com/jettzennn/mitsuyomi.git
cd mitsuyomi
cp .env.example .env
node server/server.js
```

Buka `http://localhost:3000` di browser (atau port sesuai `PORT` di `.env`).
Basis data `data/mitsuyomi.db` **dibuat otomatis** saat server pertama kali jalan — tidak ada berkas basis data yang perlu disiapkan.

> Di Termux (Android), langkahnya sama persis. Bila port 3000 sudah dipakai aplikasi lain, ganti `PORT` di `.env`, misalnya menjadi `3001`.

## Konfigurasi (.env)

| Variabel | Keterangan |
| --- | --- |
| `PORT` | Port server (bawaan `3000`) |
| `UPSTREAM_BASE` | Alamat dasar layanan data komik (kosongkan untuk bawaan server) |
| `APP_BASE_URL` | Alamat publik situs untuk tautan di dalam email |
| `GMAIL_USER` | Akun Gmail pengirim email aktivasi/reset |
| `GMAIL_APP_PASSWORD` | App Password Gmail (Google Account → Security → App passwords) — bukan kata sandi akun |
| `MAIL_FROM_NAME` | Nama pengirim yang tampil di email (bawaan `Mitsuyomi`) |
| `AUTH_SHOW_DEV_LINK` | `1` = tampilkan tautan uji di layar saat email tidak terkirim (mode lokal), `0` untuk produksi |

## Lisensi

Proyek pribadi — seluruh hak cipta dilindungi. Silakan dipakai sebagai referensi belajar.
