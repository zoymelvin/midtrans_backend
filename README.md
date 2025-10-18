# RasAi

RasAi adalah aplikasi mobile berbasis Flutter yang dirancang untuk membantu pengguna menemukan dan membuat resep masakan menggunakan kecerdasan buatan (AI). Pengguna dapat memasukkan bahan-bahan yang mereka miliki, dan aplikasi akan menghasilkan resep yang relevan menggunakan model AI generatif.

## Fitur Utama

Berdasarkan analisis file project, aplikasi ini memiliki fungsionalitas sebagai berikut:

  * **Pencarian Resep Berbasis Bahan:** Pengguna dapat memasukkan satu atau lebih bahan masakan, dan aplikasi akan mencari atau menghasilkan resep yang sesuai.
  * **Generasi Resep oleh AI:** Menggunakan model AI generatif (kemungkinan Google Generative AI berdasarkan dependensi `google_generative_ai`) untuk membuat resep baru berdasarkan input bahan.
  * **Tampilan Detail Resep:** Menampilkan detail resep yang dihasilkan, termasuk judul, deskripsi, bahan-bahan, dan instruksi memasak.
  * **Penyimpanan Resep Lokal:** Pengguna dapat menyimpan resep favorit mereka secara lokal di perangkat menggunakan Hive.
  * **Tampilan Resep Tersimpan:** Menampilkan daftar resep yang telah disimpan oleh pengguna.
  * **Antarmuka Pengguna yang Menarik:** Menggunakan komponen UI Flutter seperti Card, ListView, TextField, dan BottomNavigationBar untuk pengalaman pengguna yang baik.

## Teknologi yang Digunakan

Project ini dibangun menggunakan:

  * **Framework:** [Flutter](https://flutter.dev/)
  * **Bahasa:** [Dart](https://dart.dev/)
  * **AI:** [Google Generative AI SDK](https://www.google.com/search?q=https://pub.dev/packages/google_generative_ai) (untuk menghasilkan resep)
  * **Penyimpanan Lokal:** [Hive](https://www.google.com/search?q=https://pub.dev/packages/hive) (database NoSQL ringan)
  * **HTTP Client:** [http](https://pub.dev/packages/http) (untuk komunikasi dengan API AI)
  * **UI Components:** Flutter Material Widgets

## Prasyarat Instalasi

Sebelum Anda dapat membangun dan menjalankan project ini, pastikan Anda memiliki:

1.  **Flutter SDK:** Versi 3.16.8 atau yang lebih baru (sesuai `environment` di `pubspec.yaml`).
2.  **IDE:** Android Studio, VS Code, atau IntelliJ IDEA dengan plugin Flutter/Dart terinstal.
3.  **API Key Google Generative AI:** Anda memerlukan API Key dari Google AI Studio atau Google Cloud untuk menggunakan fitur generasi resep.
4.  Emulator atau Perangkat Fisik (Android/iOS) untuk menjalankan aplikasi.

## Susunan Project

Struktur file utama dalam project Flutter ini diatur sebagai berikut:

```
RasAi/
├── android/          (Konfigurasi build Android)
├── ios/              (Konfigurasi build iOS)
├── lib/
│   ├── db/
│   │   └── hive_boxes.dart     (Inisialisasi Hive Box)
│   ├── models/
│   │   └── ai_recipe.dart      (Model data untuk resep AI)
│   ├── screens/
│   │   ├── detail_screen.dart  (Layar detail resep)
│   │   ├── saved_screen.dart   (Layar resep tersimpan)
│   │   └── search_screen.dart  (Layar pencarian/input bahan)
│   ├── services/
│   │   └── ai_service.dart     (Logika interaksi dengan API AI)
│   ├── widgets/
│   │   └── recipe_card.dart    (Widget untuk menampilkan kartu resep)
│   └── main.dart             (Entry point aplikasi)
├── assets/
│   └── images/               (Aset gambar seperti logo, background)
├── test/
│   └── widget_test.dart      (Contoh unit test)
├── pubspec.yaml              (Deklarasi dependensi dan metadata project)
└── README.md                 (Dokumentasi project)
```

## Contoh Penggunaan (Instalasi)

Untuk menjalankan aplikasi ini secara lokal:

1.  **Clone** repositori ini:
    ```sh
    https://github.com/zoymelvin/RasAi
    cd RasAi
    ```
2.  **Siapkan API Key:**
      * Dapatkan API Key dari [Google AI Studio](https://aistudio.google.com/) atau Google Cloud Platform.
      * Masukkan API Key Anda ke dalam kode, kemungkinan besar di file `lib/services/ai_service.dart`. **(PENTING: Jangan commit API key langsung ke repository publik. Gunakan metode yang aman seperti environment variables atau file konfigurasi yang di-gitignore).**
3.  **Install Dependensi:**
    ```sh
    flutter pub get
    ```
4.  **Jalankan Aplikasi:**
    ```sh
    flutter run
    ```
    Pilih emulator atau perangkat yang terhubung.
