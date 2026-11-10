# Tabel validasi kapten

Aplikasi ini **membaca** schema `pl` milik pipeline dan **menulis** satu hal
saja: penilaian kapten setelah ia sampai di area yang direkomendasikan.

Tulisan itu ditaruh di schema terpisah bernama `kapten`. Tidak ada satu pun
tabel `pl` yang disentuh — tidak dibaca-tulis, tidak di-ALTER, tidak di-DROP.
Kalau ternyata salah rancang, `DROP SCHEMA kapten CASCADE` mengembalikan basis
data persis seperti semula.

Berkas ini adalah spesifikasi untuk dijalankan oleh pemegang akses basis data.
**Aplikasi tidak pernah membuat schema atau tabel sendiri.** Selama tabelnya
belum ada, tombol validasi tetap bisa ditekan dan jawabannya disimpan di
perangkat kapten, lalu dikirim begitu tabelnya tersedia — jadi tidak ada
jawaban yang hilang selama masa tunggu.

## DDL

```sql
CREATE SCHEMA IF NOT EXISTS kapten;

CREATE TABLE IF NOT EXISTS kapten.validasi (
  id                bigserial PRIMARY KEY,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),

  -- ===== Apa yang dinilai =====
  -- `run_id` dan ketiga kolom `*_model` adalah POTRET saat rekomendasi
  -- ditampilkan, bukan rujukan hidup. Ini yang membuat validasinya berguna:
  -- run berikutnya akan menimpa skor sel yang sama, dan tanpa potret ini
  -- tidak ada cara tahu angka berapa yang sebenarnya disetujui atau ditolak
  -- kapten. Sengaja TANPA foreign key ke pl.run — validasi harus selamat
  -- walaupun run lamanya dibersihkan.
  run_id            bigint,
  wpp_code          text NOT NULL,
  target_key        text NOT NULL,          -- 'kecil' | 'besar'
  cell_key          text NOT NULL,          -- mis. 'Z-712-0169'
  cell_level        text,                   -- 'coarse' | 'fine'
  skor_model        numeric,                -- indeks prioritas 0–100 saat itu
  kelas_model       text,                   -- 'utama' | 'ekspedisi' | 'cadangan'
  risiko_model      text,                   -- 'aman' | 'waspada' | 'bahaya'

  -- ===== Di mana & kapan kapten benar-benar berada =====
  -- Dipisahkan dari koordinat sel karena kapal tidak berhenti tepat di pusat
  -- petak. Selisih keduanya memberi tahu seberapa jauh penilaian ini dari
  -- titik yang dinilai model.
  --
  -- Untuk `mode = 'manual'` inilah catatan yang sesungguhnya: titik GPS
  -- tempat kapten menandai ada-tidaknya ikan, lepas dari petak mana pun.
  -- `cell_key` tetap diisi dengan petak TERDEKAT supaya catatan itu bisa
  -- diadu dengan perkiraan model di situ — tetapi yang dicatat kapten adalah
  -- koordinat ini, bukan pusat petaknya.
  lat               double precision,
  lon               double precision,
  tiba_pada         timestamptz,

  -- ===== Apakah kapten benar-benar di sana? =====
  -- Validasi dari orang yang tidak pernah mendatangi petaknya tidak bernilai
  -- sebagai pengujian model. Tetapi GPS juga gagal di laut, dan mengunci
  -- kapten yang MEMANG di sana sama buruknya. Jadi posisinya diperiksa,
  -- hasilnya dicatat, dan kapten tetap boleh melanjutkan dengan penegasan —
  -- yang ikut terekam di sini.
  --
  -- `false` bukan berarti catatannya salah; ia berarti catatan itu harus
  -- ditimbang lebih ringan. Analisis bisa menyaring `WHERE posisi_cocok`
  -- untuk mendapat himpunan yang paling bisa dipercaya.
  posisi_cocok      boolean,                -- GPS berada di dalam petaknya
  jarak_ke_petak_km numeric,                -- jarak GPS ke pusat petak

  -- ===== Penilaian kapten =====
  setuju            boolean NOT NULL,       -- setuju area ini banyak ikan?
  hasil             text NOT NULL
                      CHECK (hasil IN ('banyak', 'sedang', 'sepi')),
  tangkapan_kg      numeric CHECK (tangkapan_kg IS NULL OR tangkapan_kg >= 0),
  jenis_ikan        text,
  catatan           text,

  -- ===== Asal =====
  mode              text CHECK (mode IN ('eksplorasi', 'rekomendasi', 'manual')),
  kapal             text,                   -- nama/identitas kapal, bebas
  perangkat         text                    -- penanda perangkat, untuk dedup
);

-- Kueri yang akan sering dipakai: "bagaimana model di WPP ini belakangan?"
CREATE INDEX IF NOT EXISTS validasi_wpp_target_waktu
  ON kapten.validasi (wpp_code, target_key, dibuat_pada DESC);

-- "sel ini pernah dinilai siapa saja?"
CREATE INDEX IF NOT EXISTS validasi_cell
  ON kapten.validasi (cell_key);

-- Penjaga kiriman ganda: satu perangkat tidak bisa MENILAI sel yang sama dua
-- kali dalam satu hari. Kapten kadang menekan tombol dua kali di laut dengan
-- sinyal buruk, dan tanpa ini satu kunjungan terhitung dua suara.
--
-- `mode = 'manual'` SENGAJA DIKECUALIKAN. Petak besar seluas ±2.360 km², jadi
-- beberapa titik GPS yang berjauhan dalam satu hari jatuh di `cell_key` yang
-- sama — dan indeks ini akan membuangnya diam-diam. Padahal justru catatan
-- itulah yang paling berharga: beberapa pengamatan di petak yang sama, pada
-- jam dan koordinat berbeda, adalah data tentang sebaran ikan di dalam petak,
-- bukan kiriman ganda.
CREATE UNIQUE INDEX IF NOT EXISTS validasi_sekali_sehari
  ON kapten.validasi (perangkat, cell_key, (dibuat_pada::date))
  WHERE perangkat IS NOT NULL AND mode <> 'manual';

-- Penjaga kiriman ganda untuk catatan manual: koordinat DAN waktunya ikut
-- jadi kunci, jadi dua ketukan di titik dan menit yang sama tetap satu baris,
-- sementara dua titik berbeda di petak yang sama tetap dua baris.
CREATE UNIQUE INDEX IF NOT EXISTS validasi_manual_titik
  ON kapten.validasi (
    perangkat,
    round(lat::numeric, 4),
    round(lon::numeric, 4),
    date_trunc('minute', dibuat_pada)
  )
  WHERE perangkat IS NOT NULL AND mode = 'manual';
```

## Hak akses

Pengguna aplikasi (`laut` pada DSN sekarang) butuh:

```sql
GRANT USAGE ON SCHEMA kapten TO laut;
GRANT SELECT, INSERT ON kapten.validasi TO laut;
GRANT USAGE, SELECT ON SEQUENCE kapten.validasi_id_seq TO laut;
```

Sengaja tanpa `UPDATE` dan `DELETE`. Validasi adalah catatan pengamatan; kalau
kapten salah tekan, yang benar adalah mengirim catatan baru, bukan menyunting
yang lama — riwayatnya justru data.

## Memeriksa model dari validasi

Setelah terkumpul, ini kueri yang menjawab "model kita benar atau tidak":

```sql
-- Tingkat persetujuan per kelas kuadran.
-- Model sehat bila 'utama' jauh lebih sering disetujui daripada 'cadangan'.
SELECT kelas_model,
       count(*)                                        AS n,
       round(avg(setuju::int) * 100, 1)                AS persen_setuju,
       round(avg(skor_model), 1)                       AS rata_skor_model,
       count(*) FILTER (WHERE hasil = 'banyak')        AS banyak,
       count(*) FILTER (WHERE hasil = 'sedang')        AS sedang,
       count(*) FILTER (WHERE hasil = 'sepi')          AS sepi
  FROM kapten.validasi
 WHERE wpp_code = '712' AND target_key = 'kecil'
 GROUP BY kelas_model
 ORDER BY rata_skor_model DESC;
```

```sql
-- Apakah skor yang lebih tinggi benar-benar berarti lebih banyak ikan?
-- Korelasi mendekati 0 berarti skornya belum punya daya pisah.
SELECT corr(skor_model,
            CASE hasil WHEN 'banyak' THEN 2 WHEN 'sedang' THEN 1 ELSE 0 END)
         AS korelasi_skor_vs_hasil,
       count(*) AS n
  FROM kapten.validasi
 WHERE skor_model IS NOT NULL;
```

Satu peringatan dalam membacanya: validasi ini **bukan sampel acak**. Kapten
hanya mendatangi area yang direkomendasikan model, jadi area berskor rendah
nyaris tidak pernah dinilai. Angka persetujuan yang tinggi belum membuktikan
model bagus — ia bisa berarti kapten hanya pernah menguji bagian yang mudah.

Dua mode lain ada sebagian untuk melawan itu. `mode = 'eksplorasi'` berisi
petak yang kapten pilih sendiri, termasuk yang tidak direkomendasikan.
`mode = 'manual'` lebih jauh lagi: ia catatan di titik GPS mana pun, dibuat
ketika kapten kebetulan berada di sana — bukan karena aplikasi menyuruhnya ke
situ. Baris itulah yang paling mendekati sampel tak-bias, dan karena itu
paling berharga untuk menguji model:

```sql
-- Himpunan paling bisa dipercaya: hanya catatan yang posisinya terkonfirmasi.
-- Bandingkan dengan keseluruhan untuk tahu seberapa besar bedanya.
SELECT posisi_cocok,
       count(*)                          AS n,
       round(avg(setuju::int) * 100, 1)  AS persen_setuju
  FROM kapten.validasi
 WHERE mode <> 'manual'
 GROUP BY posisi_cocok;
```

```sql
-- Bandingkan ketiga asal catatan. Kalau persentase setuju pada 'rekomendasi'
-- jauh lebih tinggi daripada 'manual', kemungkinan besar model belum lebih
-- baik daripada pengalaman kapten — ia hanya diuji di tempat yang ia pilih.
SELECT mode,
       count(*)                                  AS n,
       round(avg(setuju::int) * 100, 1)          AS persen_setuju,
       round(avg(skor_model), 1)                 AS rata_skor_model,
       count(*) FILTER (WHERE hasil = 'banyak')  AS banyak
  FROM kapten.validasi
 GROUP BY mode ORDER BY n DESC;
```
