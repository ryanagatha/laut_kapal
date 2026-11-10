import { Pool } from 'pg'

/**
 * Lapisan data aplikasi kapten.
 *
 * Sengaja TIPIS. Aplikasi analis membaca kesesuaian per variabel, bobot
 * efektif, kontribusi, ambang, dan silsilah sumber — semuanya dibutuhkan untuk
 * MEMPERTANGGUNGJAWABKAN skor. Kapten tidak sedang mengaudit model; ia sedang
 * memutuskan mau ke mana sebelum berangkat. Jadi yang dibaca hanya yang
 * mengubah keputusan itu: di mana areanya, seberapa jauh, seberapa bagus, dan
 * apakah lautnya aman.
 */

let pool: Pool | undefined

function db(): Pool {
  if (!pool) {
    const connectionString = process.env.PRIORITY_LAUT_DSN || process.env.DATABASE_URL
    if (!connectionString) throw new Error('PRIORITY_LAUT_DSN belum diatur')
    const schema = process.env.PRIORITY_LAUT_SCHEMA || 'pl'
    pool = new Pool({
      connectionString,
      options: `-c search_path=${schema},public`,
      max: 4,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

const num = (v: unknown) => (v == null ? null : Number(v))

export type Target = 'kecil' | 'besar'

export type Area = {
  id: string
  lat: number
  lon: number
  /** Indeks prioritas 0–100 dari pipeline — JANGAN dihitung ulang di klien */
  skor: number
  /** Kelas kuadran pipeline: utama | ekspedisi | cadangan | hindari */
  kelas: string
  peringkat: number
  /** Jarak dari titik acuan WPP. Jarak dari kapten dihitung di klien dari GPS. */
  jarakAcuanKm: number | null
  ombakM: number | null
  ombakLabel: string | null
  ombakBesar: boolean | null
  anginKn: number | null
  anginArahDeg: number | null
  anginMataAngin: string | null
  cuaca: string | null
  /** Putusan siap-pakai dari pipeline — aman | waspada | bahaya */
  risiko: string | null
  risikoSebab: string | null
  saran: string | null
}

export type InfoWpp = {
  kode: string
  nama: string
  perairan: string
  target: Target
  targetLabel: string
  /** Kapan data ini berlaku */
  berlaku: string | null
  /** Titik acuan WPP. Bukan pelabuhan sungguhan — lihat catatan di `titikAcuan`. */
  acuan: { lat: number; lon: number } | null
}

/**
 * Titik acuan per WPP.
 *
 * Tabel `port` berisi SATU baris per WPP bernama "Representative point" —
 * sebuah titik wakil, bukan pelabuhan. Menampilkan namanya apa adanya kepada
 * kapten akan terbaca sebagai nama pelabuhan yang tidak ada. Karena itu yang
 * dipakai hanya koordinatnya, namanya tidak pernah ditampilkan, dan jarak yang
 * benar-benar berarti dihitung dari GPS kapten.
 */
async function titikAcuan(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  wpp: string,
) {
  const r = await client.query(
    `SELECT lat::float8 AS lat, lon::float8 AS lon FROM port WHERE wpp_code = $1 LIMIT 1`,
    [wpp],
  )
  const p = r.rows[0]
  return p ? { lat: Number(p.lat), lon: Number(p.lon) } : null
}

/** Wilayah yang benar-benar punya run sukses — tidak ada daftar tetap. */
export async function daftarWpp() {
  const client = await db().connect()
  try {
    const r = await client.query(
      `SELECT DISTINCT ON (wpp_code) wpp_code, wpp_name, waters, valid_at
         FROM v_run_latest ORDER BY wpp_code, valid_at DESC NULLS LAST`,
    )
    return r.rows.map((x) => ({
      kode: x.wpp_code as string,
      nama: (x.wpp_name as string) ?? `WPP ${x.wpp_code}`,
      perairan: (x.waters as string) ?? '',
      berlaku: x.valid_at?.toISOString?.() ?? x.valid_at ?? null,
    }))
  } finally {
    client.release()
  }
}

/**
 * Area tujuan berperingkat untuk satu WPP + target.
 *
 * Diambil dari sel COARSE, bukan `v_priority_area`: view itu hanya berisi 2
 * baris per run — terlalu sedikit untuk dipilih, dan dua-duanya bisa saja
 * berjarak 370 km sehingga kapten tidak punya pilihan dekat sama sekali.
 *
 * Sel `hindari` dibuang. Kapten tidak butuh daftar tempat yang tidak boleh
 * dituju; yang ia butuhkan adalah tempat yang boleh.
 */
export async function areaTujuan(wpp: string, target: Target, batas = 12) {
  const client = await db().connect()
  try {
    const run = await client.query(
      `SELECT run_id, wpp_code, wpp_name, waters, target_key, target_label, valid_at
         FROM v_run_latest WHERE wpp_code = $1 AND target_key = $2`,
      [wpp, target],
    )
    if (!run.rows[0]) return null
    const r = run.rows[0]

    const areas = await client.query(
      `SELECT c.cell_key, c.lat::float8 AS lat, c.lon::float8 AS lon,
              c.priority, c.quadrant, c.rank_in_run, c.dist_km,
              d.wave_m, d.wave_label, d.wave_is_big, d.wind_kn, d.wind_dir_deg,
              d.wind_compass, d.weather_label, d.risk, d.risk_reason, d.advice
         FROM v_cell_result c
         LEFT JOIN result_cell_condition d
           ON d.run_id = c.run_id AND d.cell_id = c.cell_id
        WHERE c.run_id = $1 AND c.level = 'coarse'
          AND c.quadrant IS DISTINCT FROM 'hindari'
        ORDER BY c.priority DESC NULLS LAST
        LIMIT $2`,
      [r.run_id, batas],
    )

    const info: InfoWpp = {
      kode: r.wpp_code,
      nama: r.wpp_name ?? `WPP ${r.wpp_code}`,
      perairan: r.waters ?? '',
      target,
      targetLabel: r.target_label ?? (target === 'kecil' ? 'Pelagis Kecil' : 'Pelagis Besar'),
      berlaku: r.valid_at?.toISOString?.() ?? r.valid_at ?? null,
      acuan: await titikAcuan(client, wpp),
    }

    const list: Area[] = areas.rows.map((x, i) => ({
      id: x.cell_key,
      lat: Number(x.lat),
      lon: Number(x.lon),
      skor: Number(x.priority),
      kelas: x.quadrant ?? 'cadangan',
      peringkat: i + 1,
      jarakAcuanKm: num(x.dist_km),
      ombakM: num(x.wave_m),
      ombakLabel: x.wave_label ?? null,
      ombakBesar: x.wave_is_big == null ? null : Boolean(x.wave_is_big),
      anginKn: num(x.wind_kn),
      anginArahDeg: num(x.wind_dir_deg),
      anginMataAngin: x.wind_compass ?? null,
      cuaca: x.weather_label ?? null,
      risiko: x.risk ?? null,
      risikoSebab: x.risk_reason ?? null,
      saran: x.advice ?? null,
    }))

    return { info, areas: list }
  } finally {
    client.release()
  }
}

/**
 * Keterangan satu titik mana pun — untuk mode Eksplorasi.
 *
 * Kapten menunjuk di peta, bukan memilih dari daftar, jadi koordinatnya
 * sembarang. Yang dikembalikan adalah sel terdekat berikut kondisinya, plus
 * jarak ke pusat sel itu supaya jelas seberapa jauh jawabannya dari yang
 * ditunjuk — pada grid 2 km jaraknya kecil, tetapi kapten berhak tahu bahwa
 * yang dibacakan bukan tepat di ujung jarinya.
 */
export async function titikTerdekat(
  wpp: string,
  target: Target,
  lat: number,
  lon: number,
  /**
   * Kunci petak yang BENAR-BENAR diketuk.
   *
   * Tanpa ini pencariannya memakai koordinat saja dan mengurutkan
   * `(level='fine') DESC` — artinya mengetuk heksagon BESAR mengembalikan
   * keterangan petak KECIL terdekat di dalamnya. Panelnya lalu menampilkan
   * skor, kelas, dan cuaca milik petak lain daripada yang disentuh jari,
   * dan aturan "pilih besar dulu, baru kecil" kehilangan artinya.
   */
  cellKey?: string | null,
) {
  const client = await db().connect()
  try {
    const run = await client.query(
      `SELECT run_id FROM v_run_latest WHERE wpp_code = $1 AND target_key = $2`,
      [wpp, target],
    )
    if (!run.rows[0]) return null
    const runId = run.rows[0].run_id

    // Dengan `cellKey`: baca petak itu persis, tanpa menebak.
    const r = cellKey
      ? await client.query(
          `SELECT c.cell_key, c.level, c.lat::float8 AS lat, c.lon::float8 AS lon,
                  c.priority, c.quadrant, c.dist_km,
                  d.wave_m, d.wave_label, d.wave_is_big, d.wind_kn, d.wind_dir_deg,
                  d.wind_compass, d.weather_label, d.risk, d.risk_reason, d.advice,
                  0::float8 AS jarak_km
             FROM v_cell_result c
             LEFT JOIN result_cell_condition d
               ON d.run_id = c.run_id AND d.cell_id = c.cell_id
            WHERE c.run_id = $1 AND c.cell_key = $2`,
          [runId, cellKey],
        )
      : // Tanpa kunci (kapten menunjuk laut kosong): petak terdekat, yang
        // 2 km didahulukan karena jawabannya paling setempat.
        await client.query(
      `SELECT c.cell_key, c.level, c.lat::float8 AS lat, c.lon::float8 AS lon,
              c.priority, c.quadrant, c.dist_km,
              d.wave_m, d.wave_label, d.wave_is_big, d.wind_kn, d.wind_dir_deg,
              d.wind_compass, d.weather_label, d.risk, d.risk_reason, d.advice,
              sqrt((c.lat - $2)^2 + ((c.lon - $3) * cos(radians($2)))^2) * 111.32 AS jarak_km
         FROM v_cell_result c
         LEFT JOIN result_cell_condition d
           ON d.run_id = c.run_id AND d.cell_id = c.cell_id
        WHERE c.run_id = $1
        ORDER BY (c.level = 'fine') DESC,
                 (c.lat - $2)^2 + ((c.lon - $3) * cos(radians($2)))^2
        LIMIT 1`,
      [runId, lat, lon],
    )
    const x = r.rows[0]
    if (!x) return null
    return {
      id: x.cell_key as string,
      level: x.level as string,
      lat: Number(x.lat),
      lon: Number(x.lon),
      jarakDariTunjukKm: num(x.jarak_km),
      skor: Number(x.priority),
      kelas: (x.quadrant as string) ?? 'cadangan',
      jarakAcuanKm: num(x.dist_km),
      ombakM: num(x.wave_m),
      ombakLabel: (x.wave_label as string) ?? null,
      ombakBesar: x.wave_is_big == null ? null : Boolean(x.wave_is_big),
      anginKn: num(x.wind_kn),
      anginArahDeg: num(x.wind_dir_deg),
      anginMataAngin: (x.wind_compass as string) ?? null,
      cuaca: (x.weather_label as string) ?? null,
      risiko: (x.risk as string) ?? null,
      risikoSebab: (x.risk_reason as string) ?? null,
      saran: (x.advice as string) ?? null,
    }
  } finally {
    client.release()
  }
}

export type TitikInfo = NonNullable<Awaited<ReturnType<typeof titikTerdekat>>>

// ===========================================================================
// Validasi kapten — satu-satunya jalur TULIS aplikasi ini.
//
// Skema & hak aksesnya ada di DATABASE-KAPTEN.md. Aplikasi TIDAK pernah
// membuat schema atau tabelnya sendiri: itu basis data produksi milik
// pipeline, dan DDL diam-diam dari sebuah aplikasi web adalah cara paling
// rapi untuk merusak sesuatu yang tidak dimiliki.
// ===========================================================================

export type Hasil = 'banyak' | 'sedang' | 'sepi'

/**
 * Asal catatan. `manual` = ditandai kapten di titik GPS mana pun, lepas dari
 * rekomendasi — satu-satunya yang mendekati sampel tak-bias, dan karena itu
 * harus tetap bisa dibedakan dari dua lainnya.
 */
export type Mode = 'rekomendasi' | 'eksplorasi' | 'manual'

export type Validasi = {
  runId?: number | null
  wpp: string
  target: Target
  cellKey: string
  cellLevel?: string | null
  skorModel?: number | null
  kelasModel?: string | null
  risikoModel?: string | null
  lat?: number | null
  lon?: number | null
  tibaPada?: string | null
  /** null = tidak diperiksa (mode manual); false = kapten menegaskan sendiri */
  posisiCocok?: boolean | null
  jarakKePetakKm?: number | null
  setuju: boolean
  hasil: Hasil
  tangkapanKg?: number | null
  jenisIkan?: string | null
  catatan?: string | null
  mode?: Mode | null
  kapal?: string | null
  perangkat?: string | null
}

/** Dilempar saat schema `kapten` belum dibuat — dibedakan dari galat lain
 *  supaya UI bisa menyimpan jawabannya di perangkat alih-alih membuangnya. */
export class TabelBelumAda extends Error {
  constructor() {
    super('Tabel kapten.validasi belum ada di basis data')
    this.name = 'TabelBelumAda'
  }
}

export async function simpanValidasi(v: Validasi) {
  const client = await db().connect()
  try {
    const r = await client.query(
      `INSERT INTO kapten.validasi
         (run_id, wpp_code, target_key, cell_key, cell_level, skor_model,
          kelas_model, risiko_model, lat, lon, tiba_pada, posisi_cocok,
          jarak_ke_petak_km, setuju, hasil, tangkapan_kg, jenis_ikan, catatan,
          mode, kapal, perangkat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21)
       ON CONFLICT DO NOTHING
       RETURNING id, dibuat_pada`,
      [
        v.runId ?? null, v.wpp, v.target, v.cellKey, v.cellLevel ?? null,
        v.skorModel ?? null, v.kelasModel ?? null, v.risikoModel ?? null,
        v.lat ?? null, v.lon ?? null, v.tibaPada ?? null,
        v.posisiCocok ?? null, v.jarakKePetakKm ?? null,
        v.setuju, v.hasil,
        v.tangkapanKg ?? null, v.jenisIkan ?? null, v.catatan ?? null,
        v.mode ?? null, v.kapal ?? null, v.perangkat ?? null,
      ],
    )
    // `ON CONFLICT DO NOTHING` + indeks sekali-sehari: kiriman ganda dari
    // tombol yang ditekan dua kali di sinyal buruk bukan galat, tetapi juga
    // bukan baris baru. Dilaporkan apa adanya supaya UI tidak berbohong
    // "tersimpan" untuk sesuatu yang sengaja diabaikan.
    return { tersimpan: r.rows.length > 0, id: r.rows[0]?.id ?? null }
  } catch (e) {
    const kode = (e as { code?: string }).code
    // 42P01 undefined_table, 3F000 invalid_schema_name
    if (kode === '42P01' || kode === '3F000') throw new TabelBelumAda()
    throw e
  } finally {
    client.release()
  }
}

/** Berapa kali sel-sel ini sudah dinilai — untuk menandai di peta & kartu. */
export async function ringkasValidasi(wpp: string, target: Target) {
  const client = await db().connect()
  try {
    const r = await client.query(
      `SELECT cell_key, count(*)::int AS n,
              count(*) FILTER (WHERE setuju)::int AS setuju
         FROM kapten.validasi
        WHERE wpp_code = $1 AND target_key = $2
        GROUP BY cell_key`,
      [wpp, target],
    )
    return Object.fromEntries(
      r.rows.map((x) => [x.cell_key as string, { n: x.n as number, setuju: x.setuju as number }]),
    )
  } catch (e) {
    const kode = (e as { code?: string }).code
    // Belum ada tabel bukan alasan menggagalkan peta — cukup tanpa penanda.
    if (kode === '42P01' || kode === '3F000') return {}
    throw e
  } finally {
    client.release()
  }
}

/**
 * Grid untuk pencarian rute: pusat petak + kondisi laut per petak.
 *
 * `cariRute` menilai tiap petak lewat `kelasCuaca`, yang membaca `windKn`,
 * `waveM`, `precipMm`, dan `weatherCode`. Tiga yang pertama ada di
 * `result_cell_condition`; kalau kosong, nilai variabel mentah di
 * `v_cell_result.values` dipakai sebagai cadangan.
 *
 * Dipakai layer COARSE, bukan fine. Rute di grid 5.000 petak akan menyeberangi
 * seluruh WPP simpul demi simpul untuk perbedaan jalur yang tidak terlihat di
 * layar ponsel, sementara waktu balasannya naik berlipat.
 */
export async function gridRute(wpp: string, target: Target) {
  const client = await db().connect()
  try {
    const run = await client.query(
      `SELECT run_id FROM v_run_latest WHERE wpp_code = $1 AND target_key = $2`,
      [wpp, target],
    )
    if (!run.rows[0]) return null
    const r = await client.query(
      `SELECT c.cell_key, c.lat::float8 AS lat, c.lon::float8 AS lon, c.size_deg,
              COALESCE(d.wave_m, (c."values"->>'wave')::numeric)  AS wave_m,
              COALESCE(d.wind_kn, (c."values"->>'wind')::numeric)  AS wind_kn,
              COALESCE(d.precip_mm, (c."values"->>'precip')::numeric) AS precip_mm,
              COALESCE(d.weather_code, (c."values"->>'weather')::int) AS weather_code,
              d.wind_dir_deg
         FROM v_cell_result c
         LEFT JOIN result_cell_condition d
           ON d.run_id = c.run_id AND d.cell_id = c.cell_id
        WHERE c.run_id = $1 AND c.level = 'coarse'`,
      [run.rows[0].run_id],
    )
    const cells = r.rows.map((x) => ({
      id: x.cell_key as string,
      lat: Number(x.lat),
      lon: Number(x.lon),
      waveM: x.wave_m == null ? undefined : Number(x.wave_m),
      windKn: x.wind_kn == null ? undefined : Number(x.wind_kn),
      precipMm: x.precip_mm == null ? undefined : Number(x.precip_mm),
      weatherCode: x.weather_code == null ? undefined : Number(x.weather_code),
    }))
    const zonaAngin = r.rows
      .filter((x) => x.wind_dir_deg != null && x.wind_kn != null)
      .map((x) => ({
        lat: Number(x.lat),
        lon: Number(x.lon),
        windDirDeg: Number(x.wind_dir_deg),
        windKn: Number(x.wind_kn),
      }))
    return {
      cells,
      zonaAngin,
      hexSizeDeg: Number(r.rows[0]?.size_deg ?? 0.1) || 0.1,
    }
  } finally {
    client.release()
  }
}

/**
 * Seluruh petak heksagon satu wilayah untuk digambar sebagai latar peta.
 *
 * Muatannya sengaja minimum — kunci, pusat, skor, kuadran — karena yang
 * dikirim adalah ratusan petak sekaligus dan ponsel di laut membayarnya
 * dengan kuota. Kondisi laut dan rinciannya baru ditarik saat satu petak
 * benar-benar dipilih.
 */
export async function petakWpp(wpp: string, target: Target, induk?: string | null) {
  const client = await db().connect()
  try {
    const run = await client.query(
      `SELECT run_id FROM v_run_latest WHERE wpp_code = $1 AND target_key = $2`,
      [wpp, target],
    )
    if (!run.rows[0]) return null
    // Dengan `induk`: layer 2 km DI DALAM petak besar itu saja.
    //
    // Tidak pernah seluruh layer halus sekaligus — run 712/kecil punya 4.965
    // petak halus, dan mengirimnya ke ponsel di laut berarti menghabiskan
    // kuota untuk petak yang 97%-nya di luar layar.
    const r = induk
      ? await client.query(
          `SELECT f.cell_key, f.lat::float8 AS lat, f.lon::float8 AS lon,
                  f.priority, f.quadrant, f.size_deg
             FROM v_cell_result f
            WHERE f.run_id = $1 AND f.level = 'fine'
              AND f.parent_id = (
                SELECT c.cell_id FROM v_cell_result c
                 WHERE c.run_id = $1 AND c.level = 'coarse' AND c.cell_key = $2
              )
            ORDER BY f.cell_key`,
          [run.rows[0].run_id, induk],
        )
      : await client.query(
          `SELECT cell_key, lat::float8 AS lat, lon::float8 AS lon,
                  priority, quadrant, size_deg
             FROM v_cell_result
            WHERE run_id = $1 AND level = 'coarse'
            ORDER BY cell_key`,
          [run.rows[0].run_id],
        )
    return {
      sizeDeg: Number(r.rows[0]?.size_deg ?? 0.1) || 0.1,
      petak: r.rows.map((x) => ({
        id: x.cell_key as string,
        lat: Number(x.lat),
        lon: Number(x.lon),
        skor: Number(x.priority),
        kelas: (x.quadrant as string) ?? 'cadangan',
      })),
    }
  } finally {
    client.release()
  }
}

/**
 * Ringkasan kondisi laut se-WPP — isi panel iklim.
 *
 * Diagregasi dari `result_cell_condition`, bukan dari satu titik contoh:
 * kapten butuh tahu apakah SELURUH wilayahnya tenang atau hanya bagian yang
 * ia lihat. Maksimum dilaporkan terpisah dari rata-rata karena rata-rata
 * menyembunyikan kantong berbahaya — laut dengan ombak rata-rata 0,4 m bisa
 * punya satu sudut 3 m, dan itulah yang menenggelamkan kapal.
 *
 * Medan yang NULL dilaporkan null, tidak diisi nol. Terukur pada run 163:
 * `wind_dir_deg`, `wind_compass`, `weather_code`, `weather_label`,
 * `wind_sector`, dan `wind_regime` kosong di seluruh 5.165 petak — jadi arah
 * angin dan peringatan badai memang tidak ada datanya, dan panel harus
 * mengatakannya alih-alih menampilkan "0°" atau "Cerah".
 */
export async function iklimWpp(wpp: string, target: Target) {
  const client = await db().connect()
  try {
    const run = await client.query(
      `SELECT run_id, valid_at FROM v_run_latest WHERE wpp_code = $1 AND target_key = $2`,
      [wpp, target],
    )
    if (!run.rows[0]) return null
    const runId = run.rows[0].run_id

    const a = await client.query(
      `SELECT count(*)::int AS n,
              avg(wave_m)  AS ombak_rata, max(wave_m)  AS ombak_maks,
              avg(wind_kn) AS angin_rata, max(wind_kn) AS angin_maks,
              count(*) FILTER (WHERE wave_is_big)::int        AS ombak_besar,
              count(*) FILTER (WHERE risk = 'aman')::int      AS aman,
              count(*) FILTER (WHERE risk = 'waspada')::int   AS waspada,
              count(*) FILTER (WHERE risk = 'bahaya')::int    AS bahaya,
              count(wind_dir_deg)::int                        AS ada_arah,
              count(weather_label)::int                       AS ada_cuaca,
              degrees(atan2(avg(sin(radians(wind_dir_deg))),
                            avg(cos(radians(wind_dir_deg))))) AS arah_vektor
         FROM result_cell_condition WHERE run_id = $1`,
      [runId],
    )
    const x = a.rows[0]

    // Mata angin & cuaca dominan — hanya bila memang tercatat.
    const dom = async (kolom: string) => {
      const r = await client.query(
        `SELECT ${kolom} AS v, count(*)::int AS n
           FROM result_cell_condition
          WHERE run_id = $1 AND ${kolom} IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
        [runId],
      )
      return r.rows[0]?.v ?? null
    }

    const n = Number(x.n) || 0
    return {
      berlaku: run.rows[0].valid_at?.toISOString?.() ?? run.rows[0].valid_at ?? null,
      nPetak: n,
      ombakRataM: num(x.ombak_rata),
      ombakMaksM: num(x.ombak_maks),
      ombakBesar: Number(x.ombak_besar) || 0,
      anginRataKn: num(x.angin_rata),
      anginMaksKn: num(x.angin_maks),
      /** null = arah angin tidak dicatat run ini, bukan 0° */
      arahVektorDeg: Number(x.ada_arah) > 0 ? num(x.arah_vektor) : null,
      mataAnginDominan: Number(x.ada_arah) > 0 ? await dom('wind_compass') : null,
      cuacaDominan: Number(x.ada_cuaca) > 0 ? await dom('weather_label') : null,
      risiko: {
        aman: Number(x.aman) || 0,
        waspada: Number(x.waspada) || 0,
        bahaya: Number(x.bahaya) || 0,
      },
    }
  } finally {
    client.release()
  }
}

/** Titik acuan wilayah, untuk menarik cuaca live. Lihat catatan `titikAcuan`. */
export async function titikAcuanWpp(wpp: string) {
  const client = await db().connect()
  try {
    return await titikAcuan(client, wpp)
  } finally {
    client.release()
  }
}
