// Tipe data domain Smart Fisheries PoC — meniru skema yang di arsitektur penuh
// tersimpan di PostgreSQL/PostGIS (master & posisi) dan TimescaleDB (time-series).

export type VesselStatus = 'berlayar' | 'menangkap' | 'kembali' | 'di pelabuhan'

export type GearType = 'Purse Seine' | 'Gillnet' | 'Longline' | 'Bagan Apung'

export interface VesselMaster {
  id: string
  name: string
  registration: string // tanda selar
  gear: GearType
  lengthM: number
  grossTonnage: number
  homePort: string
  captain: string
  crew: number
}

export interface VesselTelemetry {
  vesselId: string
  timestamp: string // ISO UTC
  lat: number
  lon: number
  speedKn: number
  headingDeg: number
  status: VesselStatus
  // Fish finder
  depthM: number
  fishIndex: number // 0-100, intensitas deteksi ikan
  waterTempC: number
}

export interface VesselLive extends VesselMaster, Omit<VesselTelemetry, 'vesselId' | 'timestamp'> {
  timestamp: string
  catchTodayKg: number
  zoneScore: number // skor fishing ground di posisi kapal
}

export interface TrackPoint {
  lat: number
  lon: number
  timestamp: string
  status: VesselStatus
}

export interface CatchRecord {
  id: string
  vesselId: string
  vesselName: string
  timestamp: string
  species: string
  weightKg: number
  lat: number
  lon: number
}

export interface FishingGroundCell {
  id: string
  lat: number // pusat sel
  lon: number
  /** Layer besar: jumlah titik sub-sampel laut yang dirata-rata (maks 13);
   *  layer 2 km²: 1 (satu titik ≈ resolusi data) */
  sampleCount?: number
  score: number // 0-100 — sumbu X, agregasi klaster Potensi Ikan
  sstC: number // suhu permukaan laut (analysed_sst)
  chlorophyll: number // chlor_a, mg/m3
  depthM: number // altitude (kedalaman)
  frontC: number // grad_sst antar sel (°C/0,1°) — penanda front termal
  /** kd_490 (m⁻¹) — hanya di cakupan arsip harvester */
  kd490?: number
  /** zooc (mmol C m⁻³, model PISCES) — hanya di cakupan arsip */
  zoocMmol?: number
  /** Fraksi PSC relevan target (mikro utk pelagis kecil, piko utk besar) */
  pscFrac?: number
  tier: 'sangat-potensial' | 'potensial' | 'sedang' | 'rendah'
  /** Petak bersinggungan dengan garis pantai — ada daratan dalam jangkauan
   *  satu heksagon dari pusatnya. Skor potensinya dibatasi supaya tidak pernah
   *  masuk kuadran utama: gerombolan pelagis kecil tidak beroperasi di tepi
   *  pantai berapa pun kesuburannya. */
  tepiPantai?: boolean
  /** Jarak ke pelabuhan melewati jangkauan operasional target. Petaknya tetap
   *  digambar dan dinilai — seluruh laut WPP tergambar — tetapi tidak pernah
   *  masuk kuadran "utama": digambar bukan berarti direkomendasikan. */
  luarJangkauan?: boolean
  /** Keteguhan petak sepanjang jendela riwayat, per variabel. `p` = pangsa
   *  terbitan yang menempatkannya di atas ambang subur; `sebelum`/`sesudah`
   *  merekam geseran kesesuaiannya. Absen bila riwayatnya tak cukup — dan
   *  ketiadaannya berarti "tidak dinilai", bukan "tidak teguh". */
  persistensi?: Record<
    string,
    { p: number; nObs: number; nTinggi: number; nilaiRerata: number; sebelum: number; sesudah: number }
  >
  /** Kesesuaian 0–1 per variabel klaster Potensi Ikan, sebelum bobot */
  factors: {
    sst: number
    chl: number
    front: number
    kd490?: number
    zooc?: number
    psc?: number
    depth?: number
    /** Salinitas — dipindah ke klaster ini dari Kondisi Laut: `soPref` adalah
     *  rentang yang DISUKAI TARGET, bukan batas aman kapal. Ia menandai jenis
     *  massa air, jadi ia menjawab "ikan apa yang ada", bukan "bisa dicapai
     *  atau tidak". */
    so?: number
    /** Anomali muka laut terhadap rerata WPP — penanda pusaran. 0,5 berarti
     *  setinggi rerata; di bawah itu siklonik (dugaan upwelling). */
    zos?: number
  }
  /** Sumbu Y — klaster Kondisi Laut & keterjangkauan operasional 0–100 */
  access: number
  distKm: number
  portName: string
  waveM: number // wave_height
  windKn?: number // wind_10m
  currentKmh?: number // |uo,vo| CMEMS atau ocean_current_velocity Open-Meteo
  soPsu?: number // salinitas CMEMS
  zosM?: number // tinggi muka laut relatif CMEMS
  precipMm?: number // curah hujan Open-Meteo
  cloudPct?: number // tutupan awan Open-Meteo
  weatherCode?: number // kode WMO
  /** Kesesuaian 0–1 per variabel klaster Kondisi Laut, sebelum bobot */
  accessFactors: {
    distance: number
    wave: number
    wind?: number
    current?: number
    precip?: number
    weather?: number
  }
  quadrant: 'utama' | 'ekspedisi' | 'cadangan' | 'hindari'
  /** Indeks prioritas gabungan (0,7·potensi + 0,3·keterjangkauan) */
  priority: number
}

export interface WeatherZone {
  id: string
  name: string
  lat: number
  lon: number
  waveM: number
  windKn: number
  windDirDeg: number
  /** Arus permukaan Open-Meteo (km/jam); CMEMS menimpanya di engine bila arsip mencakup */
  currentKmh?: number
  precipitationMm?: number
  cloudCoverPct?: number
  weatherCode?: number
  condition: 'Cerah' | 'Cerah Berawan' | 'Berawan' | 'Hujan Ringan' | 'Hujan Lebat'
  risk: 'aman' | 'waspada' | 'bahaya'
}

export interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'danger'
  category: 'cuaca' | 'fishing-ground' | 'operasional'
  title: string
  message: string
  vesselId?: string
}

export interface KpiSummary {
  totalCatchTodayKg: number
  totalCatchWeekKg: number
  activeVessels: number
  totalVessels: number
  avgFishIndex: number
  bestZoneScore: number
  alertCount: number
  catchBySpecies: { species: string; weightKg: number }[]
  catchByVessel: { vesselId: string; vesselName: string; weightKg: number }[]
  catchDaily: { date: string; weightKg: number }[]
  statusBreakdown: { status: VesselStatus; count: number }[]
}
