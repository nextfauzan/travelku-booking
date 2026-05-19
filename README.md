# TravelKu Booking

Mini project modul manajemen pemesanan untuk sistem internal agen perjalanan TravelKu.

## Stack

- Backend: Node.js + Express
- Database: MySQL
- Frontend: HTML, CSS, JavaScript

Alasan singkat: Express dipilih karena ringan untuk membuat REST API, MySQL cocok untuk data booking yang terstruktur, dan frontend dibuat tanpa framework agar modul tetap sederhana serta mudah direview dalam waktu singkat.

## Cara Menjalankan Project

1. Pastikan MySQL sudah berjalan.

2. Install dependency:

   ```bash
   npm install
   ```

3. Salin `.env.example` menjadi `.env`, lalu sesuaikan koneksi database jika perlu.

4. Jalankan server:

   ```bash
   npm start
   ```

5. Buka aplikasi di browser:

   ```text
   http://localhost:3000
   ```

Database `travelku_booking`, tabel `packages`, dan tabel `bookings` akan dibuat otomatis saat server pertama kali berjalan. Data awal paket wisata juga akan diisi otomatis.

## Fitur Selesai

- Tambah booking baru dengan status awal otomatis `Menunggu`.
- Lihat daftar booking, data terbaru tampil di atas.
- Edit dan hapus booking.
- Ubah status booking sesuai alur: `Menunggu -> Dikonfirmasi/Dibatalkan`, `Dikonfirmasi -> Selesai/Dibatalkan`, dan status akhir tidak bisa diubah lagi.
- Filter berdasarkan status, paket wisata, dan rentang tanggal keberangkatan.
- Pencarian berdasarkan nama pemesan atau kontak.
- Ringkasan jumlah booking dan estimasi pendapatan berdasarkan filter aktif.
- Validasi server untuk nama, kontak, paket, tanggal keberangkatan, jumlah peserta, dan harga per orang.
- Modul paket wisata terpisah melalui tabel `packages`; booking menyimpan relasi `package_id`.
- Validasi kapasitas paket berdasarkan paket dan tanggal keberangkatan.
- Pagination daftar booking.
- Export daftar booking ke CSV sesuai filter aktif.
- Data tersimpan di database MySQL.
- Frontend dan backend berkomunikasi melalui REST API JSON.
- Tampilan responsive untuk layar kecil.
- Unit test untuk aturan transisi status.

## Fitur Belum Selesai

- Autentikasi staf dan riwayat pembuat booking.
- Deploy online.

## Asumsi dan Keputusan Teknis

- Paket wisata disimpan di tabel `packages`, sementara `bookings.package_name` tetap disimpan sebagai snapshot nama paket saat booking dibuat.
- Kontak disimpan dalam satu kolom agar sesuai requirement yang meminta nomor telepon atau email.
- Booking baru selalu dibuat dengan status `Menunggu`; perubahan status dilakukan dari tabel daftar booking.
- Estimasi pendapatan dihitung dari `jumlah peserta x harga per orang` hanya untuk status `Dikonfirmasi` dan `Selesai`.
- Tanggal keberangkatan tidak boleh di masa lalu dan validasi ini dilakukan di backend.
- Kapasitas dihitung per paket dan tanggal keberangkatan, dengan mengecualikan booking berstatus `Dibatalkan`.

## API Backend

- `GET /api/bookings`
- `GET /api/bookings/export`
- `GET /api/bookings/:id`
- `POST /api/bookings`
- `PUT /api/bookings/:id`
- `DELETE /api/bookings/:id`
- `PATCH /api/bookings/:id/status`
- `GET /api/packages`
- `GET /api/summary`

Filter booking dan summary:

```text
?search=andi&status=Menunggu&package=Bali&startDate=2026-05-20&endDate=2026-05-30&page=1&limit=10
```

Menjalankan test:

```bash
npm test
```

## Perbaikan Jika Ada Waktu Lebih

- Menambahkan autentikasi staf dan audit trail.
- Menambahkan halaman CRUD khusus paket wisata untuk staf admin.
- Menambahkan deploy online dan database cloud.
