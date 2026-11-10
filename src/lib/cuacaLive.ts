import { config } from './config'

/**
 * Arah angin, kode cuaca, dan rezim angin — ditarik langsung dari Open-Meteo.
 *
 * KENAPA TIDAK DARI BASIS DATA
 *
 * Pipeline memang punya kolomnya (`wind_dir_deg`, `weather_code`,
 * `wind_regime`), tetapi pada run yang diperiksa ketiganya NULL di seluruh
 * 5.165 petak, dan tabel `run_context` tempat rezim angin seharusnya tinggal
 * kosong di setiap run v7. Menunggu pipeline mengisinya berarti panel
 * keselamatan kapten kosong entah sampai kapan.
 *
 * Jadi ditarik sendiri saat aplikasi dibuka. Ini SATU-SATUNYA data di
 * aplikasi ini yang tidak berasal dari pipeline, dan karena itu ditandai
 * terpisah di UI — kapten berhak tahu mana angka yang sudah ikut menghitung
 * skor dan mana yang hanya konteks cuaca hari ini.
 */

export type RezimAngin = 'barat' | 'timur' | 'peralihan'

export type CuacaLive = {
  arahDeg: number | null
  mataAngin: string | null
  anginKn: number | null
  hembusanKn: number | null
  kodeCuaca: number | null
  cuaca: string | null
  rezim: RezimAngin
  rezimLabel: string
  /** Pangsa jam dengan angin dari sektor barat / timur sepanjang jendela. */
  pangsaBaratPct: number
  pangsaTimurPct: number
  jamJendela: number
  diamatiPada: string | null
  sumber: string
}

const MATA = [
  'Utara', 'Timur Laut', 'Timur', 'Tenggara',
  'Selatan', 'Barat Daya', 'Barat', 'Barat Laut',
]

function mataAngin(deg: number): string {
  return MATA[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** Kode WMO yang dipakai Open-Meteo. 95–99 = badai petir. */
function labelWmo(kode: number): string {
  if (kode === 0) return 'Cerah'
  if (kode <= 2) return 'Cerah berawan'
  if (kode === 3) return 'Berawan'
  if (kode <= 48) return 'Berkabut'
  if (kode <= 57) return 'Gerimis'
  if (kode <= 65) return 'Hujan'
  if (kode <= 67) return 'Hujan beku'
  if (kode <= 77) return 'Hujan salju'
  if (kode <= 82) return 'Hujan deras'
  if (kode <= 86) return 'Salju deras'
  if (kode >= 95) return 'Badai petir'
  return 'Berawan'
}

/**
 * Rezim angin musiman dari arah angin beberapa hari terakhir.
 *
 * Arah Open-Meteo adalah arah angin DATANG. Angin Barat berarti angin datang
 * dari barat (225–315°), Angin Timur dari timur (45–135°). Ambang 55% dipakai
 * supaya musim peralihan — ketika arahnya memang berganti-ganti — tidak
 * dipaksa masuk salah satu musim; melaporkan "peralihan" lebih jujur daripada
 * memilih pemenang tipis dari sebaran yang sebenarnya tidak punya arah
 * dominan.
 */
function rezimDari(arah: number[]): {
  rezim: RezimAngin
  baratPct: number
  timurPct: number
} {
  if (!arah.length) return { rezim: 'peralihan', baratPct: 0, timurPct: 0 }
  let barat = 0
  let timur = 0
  for (const d0 of arah) {
    const d = ((d0 % 360) + 360) % 360
    if (d >= 225 && d < 315) barat++
    else if (d >= 45 && d < 135) timur++
  }
  const n = arah.length
  const baratPct = Math.round((barat / n) * 100)
  const timurPct = Math.round((timur / n) * 100)
  const rezim: RezimAngin =
    baratPct >= 55 ? 'barat' : timurPct >= 55 ? 'timur' : 'peralihan'
  return { rezim, baratPct, timurPct }
}

const LABEL_REZIM: Record<RezimAngin, string> = {
  barat: 'Angin Barat',
  timur: 'Angin Timur',
  peralihan: 'Musim Peralihan',
}

/**
 * Cache in-memory per koordinat.
 *
 * Tanpa ini setiap pembukaan aplikasi oleh setiap kapten memicu satu
 * permintaan ke Open-Meteo untuk titik yang sama. Angin tidak berubah dalam
 * hitungan detik, dan sumber gratis yang dihajar permintaan berulang akan
 * membatasi kita — tepat ketika sedang dibutuhkan.
 */
const cache = new Map<string, { pada: number; data: CuacaLive }>()
const TTL_MS = 20 * 60_000

export async function cuacaLive(lat: number, lon: number): Promise<CuacaLive | null> {
  const kunci = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const ada = cache.get(kunci)
  if (ada && Date.now() - ada.pada < TTL_MS) return ada.data

  const u = new URL(config.openMeteo.forecast)
  u.searchParams.set('latitude', String(lat))
  u.searchParams.set('longitude', String(lon))
  u.searchParams.set('current', 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code')
  u.searchParams.set('hourly', 'wind_direction_10m')
  u.searchParams.set('past_days', '3')
  u.searchParams.set('forecast_days', '1')
  u.searchParams.set('wind_speed_unit', 'kn')
  u.searchParams.set('timezone', 'UTC')

  const ac = new AbortController()
  const batas = setTimeout(() => ac.abort(), config.timeout.openMeteoMs)
  try {
    const r = await fetch(u, { signal: ac.signal, cache: 'no-store' })
    if (!r.ok) return null
    const j = (await r.json()) as {
      current?: Record<string, number | string>
      hourly?: { time?: string[]; wind_direction_10m?: (number | null)[] }
    }
    const c = j.current ?? {}
    const arah = (j.hourly?.wind_direction_10m ?? []).filter(
      (x): x is number => typeof x === 'number' && Number.isFinite(x),
    )
    const { rezim, baratPct, timurPct } = rezimDari(arah)

    const arahDeg = typeof c.wind_direction_10m === 'number' ? c.wind_direction_10m : null
    const kode = typeof c.weather_code === 'number' ? c.weather_code : null

    const data: CuacaLive = {
      arahDeg,
      mataAngin: arahDeg == null ? null : mataAngin(arahDeg),
      anginKn: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null,
      hembusanKn: typeof c.wind_gusts_10m === 'number' ? c.wind_gusts_10m : null,
      kodeCuaca: kode,
      cuaca: kode == null ? null : labelWmo(kode),
      rezim,
      rezimLabel: LABEL_REZIM[rezim],
      pangsaBaratPct: baratPct,
      pangsaTimurPct: timurPct,
      jamJendela: arah.length,
      diamatiPada: typeof c.time === 'string' ? c.time : null,
      sumber: 'Open-Meteo Forecast',
    }
    cache.set(kunci, { pada: Date.now(), data })
    return data
  } catch {
    // Sumber luar mati bukan alasan menggagalkan seluruh panel: ombak, angin,
    // dan sebaran risiko dari pipeline tetap bisa ditampilkan tanpa ini.
    return null
  } finally {
    clearTimeout(batas)
  }
}
