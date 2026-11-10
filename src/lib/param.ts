/**
 * Pembacaan parameter kueri yang menolak nilai kosong.
 *
 * KENAPA ADA BERKAS SENDIRI UNTUK INI
 *
 * `URLSearchParams.get()` mengembalikan `null` saat parameternya tidak ada,
 * dan `Number(null)` adalah **0** — yang lolos `Number.isFinite`. Pola
 * `Number(u.searchParams.get('lat'))` karena itu diam-diam mengubah
 * "parameter tidak dikirim" menjadi "koordinat 0°,0°", yaitu Teluk Guinea di
 * lepas pantai Afrika.
 *
 * Akibatnya bukan galat yang terlihat, melainkan jawaban yang salah dengan
 * percaya diri. Terukur pada rute `/api/titik`: permintaan tanpa koordinat
 * mengembalikan petak berjarak 11.793 km dari "titik yang ditunjuk", dan
 * `/api/rute` menjawab "rute tidak ditemukan" — seolah masalahnya pada rute,
 * padahal parameternya memang tidak pernah dikirim.
 *
 * Cacat yang sama muncul tiga kali di tiga rute berbeda, jadi penangkalnya
 * ditaruh di satu tempat.
 */

/** Angka dari parameter kueri. `null` bila tidak dikirim, kosong, atau bukan angka. */
export function angka(raw: string | null): number | null {
  if (raw === null) return null
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Lintang −90..90. `null` bila tidak dikirim atau di luar batas. */
export function lintang(raw: string | null): number | null {
  const n = angka(raw)
  return n !== null && Math.abs(n) <= 90 ? n : null
}

/** Bujur −180..180. `null` bila tidak dikirim atau di luar batas. */
export function bujur(raw: string | null): number | null {
  const n = angka(raw)
  return n !== null && Math.abs(n) <= 180 ? n : null
}
