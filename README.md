# Failover Score

Kuis 2 menit buat ngecek backup plan keuangan keluarga, plus Lead Desk buat ngurus yang minta Report.

- **Web kuis:** https://failoverplan.id/
- **Lead Desk:** https://failoverplan.id/admin.html
- **Domain:** failoverplan.id, dibeli di Hostinger. DNS-nya 4 record A `@` ke IP GitHub Pages (185.199.108.153 sampai 185.199.111.153) dan CNAME `www` ke `async-me.github.io`. File `CNAME` di repo ini yang nyambungin domainnya ke GitHub Pages, jangan dihapus. Alamat lama `async-me.github.io/failover-score` otomatis diarahin ke sini.
- **Database:** Supabase, project `failover-score` (ref `dvdwygekvxvdyhlykagp`) di organization Onward Org, region Singapore, plan gratis.
- **Hosting:** GitHub Pages dari repo ini. Tiap ada push ke branch `gh-pages`, web ke-update sendiri dalam 1–2 menit.

Stack: HTML, CSS, dan JavaScript biasa (tanpa build), Supabase buat database dan login.

## Isi repo

| File | Fungsinya |
| --- | --- |
| `config.js` | URL Supabase, key publik, nomor WhatsApp, nama, janji waktu Report, dan Meta Pixel ID |
| `index.html`, `app.js`, `style.css` | Halaman kuis |
| `score.js` | Logika skor, hitungan Report, dan label prioritas lead, dipakai kuis dan Lead Desk |
| `admin.html`, `admin.js`, `admin.css` | Lead Desk |
| `setup.sql` | Setup database (udah dijalankan di project Supabase) |
| `tests/score.test.js` | Tes logika skor pakai 3 skenario simulator: `node tests/score.test.js` |
| `.nojekyll` | Biar GitHub Pages nyajiin file apa adanya |
| `CNAME` | Domain failoverplan.id buat GitHub Pages |

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
| Bio Instagram | `https://failoverplan.id/?src=ig` |
| Bio Threads | `https://failoverplan.id/?src=threads` |
| Bio TikTok (setelah 1.000 follower atau akun bisnis) | `https://failoverplan.id/?src=tiktok` |
| QR code di event bareng RS | `https://failoverplan.id/?src=event-padel` |

Sumbernya cuma boleh huruf kecil, angka, `-`, atau `_`.

## Ngukur iklan

Ada dua penghitung yang jalan barengan:

1. **Penghitung sendiri (tabel `events` di Supabase).** Nyatet 4 langkah: buka web, mulai kuis, kuis selesai, dan klik tombol WhatsApp, plus sumber link-nya. Nggak ada nama, jawaban, score, atau IP. Tiap langkah dihitung sekali per sesi browser. Hasilnya muncul di **Rekap per sumber** di Lead Desk.
2. **Meta Pixel.** Aktif kalau `META_PIXEL_ID` di `config.js` diisi. Event yang dikirim ke Meta:

| Kapan | Event Meta |
| --- | --- |
| Web dibuka | `PageView` |
| Hasil score muncul | `QuizComplete` (custom) |
| Form Report terkirim | `Lead` |
| Klik tombol WhatsApp | `Contact` |

Yang dikirim ke Meta cuma nama event-nya. Jawaban, score, nama, dan nomor HP nggak pernah ikut. Di Events Manager, **Automatic advanced matching harus dimatiin**, biar Meta nggak ngambil isi form sendiri.

Buat ngoptimasi iklan ke "kuis selesai", bikin **custom conversion** di Events Manager dari event `QuizComplete`, lalu pilih itu di setting kampanye.

## Label prioritas di Lead Desk

Tiap lead dapat label dari jawabannya, buat nentuin siapa yang di-chat duluan:

| Poin | Dari mana |
| --- | --- |
| 0–3 | Pemasukan: di bawah Rp10 juta 0, Rp10–15 juta 1, Rp15–25 juta 2, di atas Rp25 juta 3 |
| 1–2 | Ada tanggungan, asuransi jiwa masih dari kantor (1) atau belum ada (2) |
| 1 | Belum ada asuransi kesehatan selain BPJS |
| 1 | Anak paling kecil umur 5 ke bawah |
| 1 | Ada KPR |

5 poin ke atas **Prioritas**, 3–4 **Potensial**, di bawah itu **Edukasi dulu**. Aturannya ada di `FS.priority` di `score.js`. Ini cuma urutan kerja. Semua yang minta Report tetap dikirimin sesuai janji.

## Siapin WhatsApp Business

Pasang **Greeting message** biar tiap orang yang kirim kode langsung dapat balasan:

> Hai! Makasih udah isi form Failover Score. Report kamu lagi aku siapin, nanti aku kirim di chat ini maksimal 2 hari kerja. Semuanya lewat tulisan, nggak ada telepon dadakan.

## Kerja harian di Lead Desk

1. Buka Lead Desk tiap malam. Filter **Lewat janji** nunjukin yang Report-nya udah lewat dari 2 hari kerja, dan filter **Prioritas** nunjukin yang paling cocok di-chat duluan.
2. Buka lead-nya. Di bagian **Draft Report buat WhatsApp**, Report-nya udah tersusun otomatis dari jawaban dia.
3. Baca dan edit seperlunya di kotak itu, tekan **Salin Report**, lalu tempel di chat WhatsApp dia (cari pakai kode `FP-XXXX` yang dia kirim).
4. Ganti status jadi **Report dikirim**, lalu **Simpan**.

Kalau butuh data mentahnya, misalnya buat diskusi sama mentor, pakai **Salin ringkasan buat Report**.

## Data dan keamanan

- **Key di `config.js` itu key publik (publishable), aman ditaruh di sini.** Pengunjung cuma bisa ngirim data lewat fungsi `submit_lead`, yang ngecek isinya dulu. Mereka nggak bisa baca data siapa pun. Jangan pernah taruh secret key atau `service_role` key di repo ini.
- **Hapus data lebih dari 1 tahun.** Form janji datanya disimpan paling lama 1 tahun. Jalankan sebulan sekali di SQL Editor: `select public.purge_old_leads();` (sekalian ngehapus catatan pengunjung yang lebih dari 1 tahun).
- **Pemberitahuan di halaman intro** bilang web ini ngitung pengunjung dan pakai Meta Pixel. Kalau agency minta banner persetujuan cookie, tambahin sebelum iklan jalan.
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
