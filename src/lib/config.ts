// Satu-satunya sumber konfigurasi runtime.
//
// Semua nilai punya default yang masuk akal, jadi aplikasi tetap jalan tanpa
// file .env sama sekali. Variabel hanya perlu diisi bila ingin menimpa default
// (mis. memperpendek timeout agar muat di batas Netlify Functions).
//
// Sumber data eksternal seluruhnya open access — tidak ada API key di sini.

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return raw !== undefined && raw !== '' && isFinite(n) ? n : fallback
}

function str(raw: string | undefined, fallback: string): string {
  return raw !== undefined && raw !== '' ? raw : fallback
}

// Nilai yang hanya dibaca di server. Di browser `process` tidak ada sama
// sekali, jadi objeknya dijaga agar modul ini tetap aman diimpor dari komponen
// klien (peta & simulator memakainya).
const env: Record<string, string | undefined> =
  typeof process === 'undefined' ? {} : process.env

export const config = {
  // ===== Endpoint sumber data eksternal =====
  erddap: {
    // NOAA CoastWatch West Coast — SST MUR (jplMURSST41) & batimetri (etopo180).
    // PERINGATAN: per 16 Agustus 2026 host ini menerima koneksi TCP lalu memutus
    // handshake TLS, dan seluruh dataset di dalamnya ikut mati. Rantai endpoint
    // di src/lib/satellite/index.ts menanganinya; jangan hapus entri ini —
    // begitu host pulih, MUR terpakai lagi tanpa perubahan kode.
    coastwatchPfeg: str(env.ERDDAP_COASTWATCH_PFEG, 'https://coastwatch.pfeg.noaa.gov/erddap'),
    // Host kembar PFEG. Melayani etopo180 langsung, tetapi untuk MUR hanya
    // me-redirect balik ke coastwatchPfeg — karena itu hanya dipakai batimetri.
    upwellPfeg: str(env.ERDDAP_UPWELL_PFEG, 'https://upwell.pfeg.noaa.gov/erddap'),
    // NOAA PIFSC OceanWatch — chlorophyll-a mingguan (kini beku, jadi cadangan)
    oceanwatchPifsc: str(env.ERDDAP_OCEANWATCH_PIFSC, 'https://oceanwatch.pifsc.noaa.gov/erddap'),
    // NOAA CoastWatch pusat — SST Geo-polar Blended & chlorophyll-a DINEOF
    coastwatchNoaa: str(env.ERDDAP_COASTWATCH_NOAA, 'https://coastwatch.noaa.gov/erddap'),
  },
  openMeteo: {
    marine: str(env.OPEN_METEO_MARINE_URL, 'https://marine-api.open-meteo.com/v1/marine'),
    forecast: str(env.OPEN_METEO_FORECAST_URL, 'https://api.open-meteo.com/v1/forecast'),
  },
  // Tile peta dasar — diekspos ke browser, wajib berprefiks NEXT_PUBLIC_.
  // Ditulis lengkap `process.env.NAMA` supaya Next menggantinya dengan nilai
  // literal saat build; menyalinnya lewat variabel perantara membuat
  // penggantian itu gagal dan `process` bocor ke bundel klien.
  mapTileUrl: str(
    process.env.NEXT_PUBLIC_MAP_TILE_URL,
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  ),
  // Style vektor MapTiler (ocean-v4) — dipakai bila terisi; kosongkan untuk
  // kembali ke raster OSM di atas. Key MapTiler bersifat publishable
  // (memang dikirim ke browser); batasi per-domain dari dashboard MapTiler.
  mapStyleUrl: str(
    process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    '',
  ),

  // ===== Batas waktu fetch (ms) =====
  // ERDDAP mengirim grid ribuan titik, jadi butuh jauh lebih lama dari
  // Open-Meteo. Netlify Functions memutus di 10 s (26 s pada plan berbayar) —
  // turunkan nilai ini bila endpoint sering timeout di produksi.
  timeout: {
    erddapMs: num(env.FETCH_TIMEOUT_ERDDAP_MS, 25_000),
    openMeteoMs: num(env.FETCH_TIMEOUT_OPEN_METEO_MS, 15_000),
  },

  // ===== Masa berlaku cache in-memory (ms) =====
  // ttl  = umur data yang berhasil diambil
  // fail = cache negatif, mencegah sumber yang down dihajar terus-menerus
  cache: {
    satelliteTtlMs: num(env.CACHE_SATELLITE_TTL_MS, 6 * 3600_000), // SST & chl-a
    bathymetryTtlMs: num(env.CACHE_BATHYMETRY_TTL_MS, 7 * 24 * 3600_000), // dasar laut ~statis
    marineTtlMs: num(env.CACHE_MARINE_TTL_MS, 60 * 60_000),
    weatherTtlMs: num(env.CACHE_WEATHER_TTL_MS, 30 * 60_000),
    satelliteFailTtlMs: num(env.CACHE_SATELLITE_FAIL_TTL_MS, 10 * 60_000),
    bathymetryFailTtlMs: num(env.CACHE_BATHYMETRY_FAIL_TTL_MS, 30 * 60_000),
    marineFailTtlMs: num(env.CACHE_MARINE_FAIL_TTL_MS, 10 * 60_000),
    weatherFailTtlMs: num(env.CACHE_WEATHER_FAIL_TTL_MS, 5 * 60_000),
  },

  // ===== Grid heksagon =====
  // Luas satu sel heksagon dalam km². Grid dirapatkan/direnggangkan otomatis
  // bila jumlah sel untuk satu WPP melewati hexMaxCells (WPP besar seperti 718
  // mustahil digambar 2 km² sekaligus); luas efektif dilaporkan API & UI.
  hex: {
    areaKm2: num(env.HEX_AREA_KM2, 2),
    maxCells: num(env.HEX_MAX_CELLS, 20_000),
    // Dua layer: peta WPP menampilkan heksagon BESAR (± sebanyak ini, ukuran
    // menyesuaikan luas laut wilayah); klik satu sel besar membuka grid halus
    // areaKm2 (2 km²) di dalam sel itu saja.
    coarseCells: num(env.HEX_COARSE_CELLS, 1500),
  },

  // ===== Arsip harvester (data_terkini) =====
  // Berkas .json.gz hasil harvester/ dipakai aplikasi sebagai: (1) cadangan
  // bila sumber live tak terjangkau, (2) satu-satunya sumber untuk variabel
  // yang tidak ditarik live (zooplankton, kd490, ocean-hourly, PSC).
  archiveDir: str(env.ARCHIVE_DIR, 'data_terkini'),

  // ===== Area kajian =====
  // Default mencakup pantura Jawa, dari Teluk Jakarta sampai perairan Madura.
  //
  // Berprefiks NEXT_PUBLIC_ karena grid dipakai di kedua sisi: server memakainya
  // untuk menyusun query ERDDAP, browser untuk menggambar medan di peta. Tanpa
  // prefiks itu nilainya hanya sampai ke server dan klien diam-diam memakai
  // default — kedua sisi jadi tidak sinkron.
  grid: {
    latMin: num(process.env.NEXT_PUBLIC_GRID_LAT_MIN, -7.15),
    latMax: num(process.env.NEXT_PUBLIC_GRID_LAT_MAX, -4.95),
    lonMin: num(process.env.NEXT_PUBLIC_GRID_LON_MIN, 106.0),
    lonMax: num(process.env.NEXT_PUBLIC_GRID_LON_MAX, 112.8),
    step: num(process.env.NEXT_PUBLIC_GRID_STEP_DEG, 0.1),
  },
} as const
