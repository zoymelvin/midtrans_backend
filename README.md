# Backend Midtrans untuk GadjahDjaya

Project ini adalah backend Node.js sederhana yang berfungsi sebagai perantara untuk berinteraksi dengan **Midtrans Payment Gateway**. Tujuannya adalah untuk menghasilkan token transaksi (Snap Token) yang akan digunakan oleh aplikasi Android GadjahDjaya untuk memproses pembayaran.

## Peran dalam GadjahDjaya

Backend ini secara khusus dibuat untuk mendukung aplikasi **GadjahDjaya**. Aplikasi GadjahDjaya (Android/Kotlin) akan berkomunikasi dengan backend ini untuk:

1.  Mengirim detail transaksi (jumlah total, ID pesanan unik, detail item, info pelanggan).
2.  Menerima **Snap Token** dari backend ini.
3.  Menggunakan Snap Token tersebut untuk menampilkan halaman pembayaran Midtrans (Midtrans UI Kit) di dalam aplikasi Android.

Hal ini memisahkan logika backend dan kunci rahasia (Midtrans Server Key) dari aplikasi Android, meningkatkan keamanan.

## Fitur Utama

  * **Generate Snap Token:** Endpoint API untuk menerima detail transaksi dan menghasilkan Snap Token dari Midtrans.
  * **Keamanan:** Menggunakan environment variables (`.env`) untuk menyimpan kunci rahasia Midtrans (Server Key), sehingga tidak terekspos di kode sumber.
  * **Deployment Ready:** Dikonfigurasi untuk deployment sebagai **Firebase Cloud Function**.

## Teknologi yang Digunakan

  * **Runtime:** [Node.js](https://nodejs.org/)
  * **Framework:** [Express.js](https://expressjs.com/) (Digunakan di dalam Firebase Function)
  * **Payment Gateway SDK:** [Midtrans Node Client](https://github.com/midtrans/midtrans-nodejs-client)
  * **Environment Variables:** [dotenv](https://www.npmjs.com/package/dotenv)
  * **Deployment:** [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
  * **Utilities:**
      * [CORS](https://www.npmjs.com/package/cors) (Untuk mengizinkan request dari domain/aplikasi lain)
      * [Nodemon](https://nodemon.io/) (Untuk development lokal, restart otomatis saat ada perubahan kode)

## Prasyarat Instalasi

Sebelum Anda dapat menjalankan project ini, pastikan Anda memiliki:

1.  **Node.js:** Versi 18 atau yang lebih baru direkomendasikan.
2.  **npm** atau **yarn** (Package Manager).
3.  **Akun Midtrans:**
      * Dapatkan **Server Key** Anda dari dashboard Midtrans (Sandbox atau Production).
4.  **Akun Firebase:** (Jika ingin deploy ke Firebase Functions)
      * Project Firebase yang sudah dibuat.
      * Firebase CLI terinstal dan terkonfigurasi (`npm install -g firebase-tools`, `firebase login`).

## Susunan Project

Struktur file utama dalam project ini diatur sebagai berikut:

```
midtrans_backend/
├── functions/
│   ├── .env              (File environment variables - *Perlu dibuat manual*)
│   ├── index.js          (Logika utama Cloud Function & endpoint API)
│   ├── package.json      (Dependensi Node.js untuk functions)
│   └── node_modules/     (Direktori dependensi - terinstall otomatis)
├── .env                  (File environment variables level root - *jika menjalankan server.js*)
├── .firebaserc           (Konfigurasi project Firebase)
├── firebase.json         (Konfigurasi deployment Firebase Functions)
├── server.js             (Server Express lokal untuk testing - Opsional)
├── package.json          (Dependensi level root - jika menggunakan server.js)
└── README.md             (Dokumentasi project)

```
