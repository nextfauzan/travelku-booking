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

Database `travelku_booking` dan tabel `bookings` akan dibuat otomatis saat server pertama kali berjalan.

## Fitur Selesai

- Tambah booking baru dengan status awal otomatis `Menunggu`.
- Lihat daftar booking, data terbaru tampil di atas.
- Edit dan hapus booking.
- Ubah status booking sesuai alur: `Menunggu -> Dikonfirmasi/Dibatalkan`, `Dikonfirmasi -> Selesai/Dibatalkan`, dan status akhir tidak bisa diubah lagi.
- Filter berdasarkan status, paket wisata, dan rentang tanggal keberangkatan.
- Ringkasan jumlah booking dan estimasi pendapatan berdasarkan filter aktif.
- Validasi server untuk nama, kontak, paket, tanggal keberangkatan, jumlah peserta, dan harga per orang.
- Data tersimpan di database MySQL.
- Frontend dan backend berkomunikasi melalui REST API JSON.
- Tampilan responsive untuk layar kecil.

## Fitur Belum Selesai

- Pencarian berdasarkan nama pemesan atau kontak.
- Modul paket wisata terpisah dengan relasi tabel.
- Validasi kapasitas paket.
- Pagination.
- Export CSV.
- Autentikasi staf dan riwayat pembuat booking.
- Unit test.
- Deploy online.

## Asumsi dan Keputusan Teknis

- Paket wisata masih disimpan sebagai teks bebas karena modul paket wisata bersifat bonus.
- Kontak disimpan dalam satu kolom agar sesuai requirement yang meminta nomor telepon atau email.
- Booking baru selalu dibuat dengan status `Menunggu`; perubahan status dilakukan dari tabel daftar booking.
- Estimasi pendapatan dihitung dari `jumlah peserta x harga per orang` hanya untuk status `Dikonfirmasi` dan `Selesai`.
- Tanggal keberangkatan tidak boleh di masa lalu dan validasi ini dilakukan di backend.

## API Backend

- `GET /api/bookings`
- `GET /api/bookings/:id`
- `POST /api/bookings`
- `PUT /api/bookings/:id`
- `DELETE /api/bookings/:id`
- `PATCH /api/bookings/:id/status`
- `GET /api/summary`

Filter booking dan summary:

```text
?status=Menunggu&package=Bali&startDate=2026-05-20&endDate=2026-05-30
```

## Perbaikan Jika Ada Waktu Lebih

- Menambahkan tabel `packages` agar paket dipilih dari data master.
- Menambahkan test untuk aturan transisi status.
- Menambahkan pagination dan pencarian nama/kontak untuk data besar.
- Menambahkan export CSV untuk laporan staf.
- Menambahkan autentikasi staf dan audit trail.
