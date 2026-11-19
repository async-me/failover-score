# Failover Score

Kuis 2 menit buat ngecek backup plan keuangan keluarga, plus Lead Desk buat ngurus yang minta Report.

- **Web kuis:** https://async-me.github.io/failover-score/
- **Lead Desk:** https://async-me.github.io/failover-score/admin.html
- **Database:** Supabase, project `failover-score` (ref `dvdwygekvxvdyhlykagp`) di organization Onward Org, region Singapore, plan gratis.
- **Hosting:** GitHub Pages dari repo ini. Tiap ada push ke branch `gh-pages`, web ke-update sendiri dalam 1–2 menit.

Stack: HTML, CSS, dan JavaScript biasa (tanpa build), Supabase buat database dan login.

## Isi repo

| File | Fungsinya |
| --- | --- |
| `config.js` | URL Supabase, key publik, nomor WhatsApp, nama, dan janji waktu Report |
| `index.html`, `app.js`, `style.css` | Halaman kuis |
| `score.js` | Logika skor dan hitungan Report, dipakai kuis dan Lead Desk |
| `admin.html`, `admin.js`, `admin.css` | Lead Desk |
| `setup.sql` | Setup database (udah dijalankan di project Supabase) |
| `tests/score.test.js` | Tes logika skor pakai 3 skenario simulator: `node tests/score.test.js` |
| `.nojekyll` | Biar GitHub Pages nyajiin file apa adanya |

## Bikin akun admin (sekali aja)

1. Buka Lead Desk, pilih **Belum punya akun? Daftar**, isi email dan password-mu sendiri.
2. Kirim email itu ke Claude, atau jalankan ini di Supabase SQL Editor (ganti emailnya):
   ```sql
   update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = 'email-kamu@gmail.com';
   insert into public.admins (user_id) select id from auth.users where email = 'email-kamu@gmail.com' on conflict do nothing;
   ```
3. Masuk di Lead Desk. Akun lain yang daftar tetap nggak bisa lihat data apa pun, karena cuma akun di tabel `admins` yang bisa baca.

## Link per platform

Pakai link yang beda buat tiap tempat, biar ketahuan leads datang dari mana:

| Dipasang di | Link |
| --- | --- |
| Bio Instagram | `https://async-me.github.io/failover-score/?src=ig` |
| Bio Threads | `https://async-me.github.io/failover-score/?src=threads` |
| Bio TikTok (setelah 1.000 follower atau akun bisnis) | `https://async-me.github.io/failover-score/?src=tiktok` |
| QR code di event bareng RS | `https://async-me.github.io/failover-score/?src=event-padel` |

Sumbernya cuma boleh huruf kecil, angka, `-`, atau `_`.

## Siapin WhatsApp Business

Pasang **Greeting message** biar tiap orang yang kirim kode langsung dapat balasan:

> Hai! Makasih udah isi form Failover Score. Report kamu lagi aku siapin, nanti aku kirim di chat ini maksimal 2 hari kerja. Semuanya lewat tulisan, nggak ada telepon dadakan.

## Kerja harian di Lead Desk

1. Buka Lead Desk tiap malam. Filter **Lewat janji** nunjukin yang Report-nya udah lewat dari 2 hari kerja.
2. Buka lead-nya. Di bagian **Draft Report buat WhatsApp**, Report-nya udah tersusun otomatis dari jawaban dia.
3. Baca dan edit seperlunya di kotak itu, tekan **Salin Report**, lalu tempel di chat WhatsApp dia (cari pakai kode `FP-XXXX` yang dia kirim).
4. Ganti status jadi **Report dikirim**, lalu **Simpan**.

Kalau butuh data mentahnya, misalnya buat diskusi sama mentor, pakai **Salin ringkasan buat Report**.

## Data dan keamanan

- **Key di `config.js` itu key publik (publishable), aman ditaruh di sini.** Pengunjung cuma bisa ngirim data lewat fungsi `submit_lead`, yang ngecek isinya dulu. Mereka nggak bisa baca data siapa pun. Jangan pernah taruh secret key atau `service_role` key di repo ini.
- **Hapus data lebih dari 1 tahun.** Form janji datanya disimpan paling lama 1 tahun. Jalankan sebulan sekali di SQL Editor: `select public.purge_old_leads();`
- **Kalau ada yang minta datanya dihapus**, pakai tombol **Hapus lead ini** di Lead Desk.
- **Project Supabase gratis bisa di-pause** kalau lama nggak ada aktivitas. Kalau web tiba-tiba gagal ngirim form, cek dashboard Supabase dan resume project-nya.

## Sebelum launch

- [ ] Tanya mentor: materi promosi pribadi kayak gini perlu approval dari agency nggak.
- [ ] Baca ulang disclaimer di halaman intro dan hasil.
- [ ] Minta 5 teman ngisi dari HP. Catat di pertanyaan mana mereka bingung.
- [ ] Hapus semua lead tes di Lead Desk.

## Kalau mau ngubah sesuatu

- **Pertanyaan, poin, atau batas status skor:** ubah di `score.js`, lalu update angka di `tests/score.test.js` dan jalankan tesnya.
- **Tulisan di layar kuis:** ada di `app.js`, di bagian `SCREENS`.
- **Warna dan ukuran:** `style.css` buat kuis, `admin.css` buat Lead Desk.
