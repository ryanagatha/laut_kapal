# laut_kapal

Aplikasi nakhoda untuk memilih area melaut, dan untuk **memvalidasi** apakah
model fishing-ground itu benar.

Ia membaca schema `pl` milik pipeline `priority-laut` — petak heksagon, skor
prioritas, kondisi laut — lalu mengembalikan satu hal yang tidak dipunyai
pipeline: pengamatan lapangan. Kapten yang sudah sampai di lokasi menandai ada
atau tidaknya ikan, dan catatan itulah yang bisa dipakai menguji modelnya.

Pendampingnya, `laut_statis`, adalah aplikasi analis untuk membaca model secara
rinci. Aplikasi ini sengaja tidak melakukan itu: kapten tidak sedang mengaudit
bobot variabel, ia sedang memutuskan berangkat ke mana.

## Tiga mode

| Mode | Untuk apa | Yang dicatat |
|---|---|---|
| **Rekomendasi** | Hanya petak hijau (`utama`) yang menyala; sisanya diredupkan jadi konteks. | Penilaian terhadap petak yang model tunjuk. |
| **Eksplorasi** | Seluruh petak tergambar, kapten memilih sendiri — termasuk yang tidak dianjurkan. | Penilaian terhadap petak pilihan kapten. |
| **Pencatatan Manual** | Tandai titik GPS mana pun tempat kapten sedang berada. | Koordinat dan waktunya, lepas dari petak mana pun. |

Ketiganya menulis ke tabel yang sama dengan kolom `mode` berbeda, dan
perbedaan itu yang membuat datanya berguna. Rekomendasi hanya menguji model di
lapangan pilihan model sendiri; **manual** adalah satu-satunya yang mendekati
sampel tak-bias, karena kapten ke sana bukan karena disuruh aplikasi.

## Peta

Dua layer heksagon — besar dan 2 km — dengan indeks prioritas 0–100 tertulis di
tengah tiap petak. Ketuk petak besar untuk membuka petak 2 km di dalamnya;
isi petak besar mengosong supaya angka induk tidak terbaca sebagai nilai petak
kecil.

Warna dan ambangnya **disalin nilai demi nilai** dari `laut_statis`
(`src/lib/warna.ts`), supaya satu warna berarti satu hal yang sama di kedua
aplikasi.

## Rute

Dari posisi kapal ke petak tujuan, menyusuri pusat petak dan membebani petak
berombak/berangin/berbadai — bukan garis lurus. Dua pilihan: **Tercepat**
(denda petak buruk 3×) dan **Teraman** (25×).

Selisih panjangnya dibandingkan terhadap jalur terpendek **di grid yang sama**,
bukan terhadap garis lurus. Rute selalu lebih panjang daripada garis lurus
karena menyusuri pusat petak; menyebut selisih itu "ongkos menghindari cuaca"
adalah klaim palsu.

## Cuaca

Ombak, angin, dan sebaran risiko dari pipeline. Arah angin, kode cuaca, dan
rezim musiman **tidak ada** di pipeline — pada run yang diperiksa ketiganya
NULL di seluruh petak — jadi ditarik langsung dari Open-Meteo di petak yang
sedang dipilih, dan ditandai `LIVE` supaya terpisah dari angka yang ikut
menghitung skor.

## Menjalankan

```bash
npm install
cp .env.local.contoh .env.local   # isi PRIORITY_LAUT_DSN
npm run dev                       # http://localhost:3100
```

Variabel yang dibaca:

| Variabel | Untuk apa |
|---|---|
| `PRIORITY_LAUT_DSN` | Koneksi PostgreSQL ke basis data pipeline |
| `PRIORITY_LAUT_SCHEMA` | Schema pipeline, bawaan `pl` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Style MapTiler. Kosongkan untuk memakai raster OSM. |

Key MapTiler dibatasi per-domain. Bila ditolak, peta **jatuh ke OSM** dan tetap
tampil — tetapi angka di petak hilang, karena raster tidak menyediakan glyphs.
Aplikasi menyatakannya di layar alih-alih mendiamkannya.

## Basis data

Aplikasi ini **membaca** `pl` dan **menulis** hanya ke schema terpisah
`kapten`. Skemanya ada di [`DATABASE-KAPTEN.md`](DATABASE-KAPTEN.md) —
termasuk hak akses dan kueri untuk mengukur ketepatan model dari catatan yang
terkumpul.

**Aplikasi tidak pernah membuat schema atau tabelnya sendiri.** Selama tabelnya
belum ada, penilaian kapten disimpan di perangkat dan dikirim begitu tersedia,
jadi tidak ada yang hilang selama masa tunggu.
