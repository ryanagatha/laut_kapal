/**
 * Hitungan jarak & arah di sisi klien.
 *
 * Jarak yang berarti bagi kapten adalah jarak dari KAPALNYA, bukan dari titik
 * acuan WPP — dan posisi kapal datang dari GPS perangkat, yang hanya ada di
 * browser. Karena itu hitungannya di sini, bukan di server.
 */

const R_BUMI_KM = 6371.0088

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Jarak lingkaran besar, km. */
export function jarakKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Arah awal dari a ke b, derajat dari utara searah jarum jam. */
export function bearingDeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLon = rad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

const MATA = [
  'Utara', 'Timur Laut', 'Timur', 'Tenggara',
  'Selatan', 'Barat Daya', 'Barat', 'Barat Laut',
]

/** Nama mata angin dalam bahasa Indonesia penuh — bukan singkatan.
 *  "BD" perlu diterjemahkan dalam kepala; "Barat Daya" tidak. */
export function mataAngin(deg: number): string {
  return MATA[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** Lama tempuh garis lurus pada kecepatan tertentu (knot). */
export function jamTempuh(km: number, knot = 8): number {
  return km / (knot * 1.852)
}

/** "3 jam 20 menit" / "45 menit" — bukan "3,33 jam". */
export function lamaManusiawi(jam: number): string {
  if (!isFinite(jam) || jam < 0) return '—'
  const total = Math.round(jam * 60)
  const j = Math.floor(total / 60)
  const m = total % 60
  if (j === 0) return `${m} menit`
  if (m === 0) return `${j} jam`
  return `${j} jam ${m} menit`
}

/** Koordinat gaya pelaut: 6,36°LS · 136,63°BT. */
export function koordinat(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'LS' : 'LU'}`
  const lo = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'BB' : 'BT'}`
  return `${la} · ${lo}`
}
