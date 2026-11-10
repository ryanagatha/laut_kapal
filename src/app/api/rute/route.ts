import { NextResponse } from 'next/server'
import { gridRute, type Target } from '@/lib/kapten'
import { cariRute } from '@/lib/sim/rute'
import type { FishingGroundCell } from '@/lib/sim/types'
import { angka, bujur, lintang } from '@/lib/param'

export const dynamic = 'force-dynamic'

/**
 * Rute dari posisi kapten ke area tujuan.
 *
 * Bukan garis lurus. `cariRute` menyusuri pusat petak dan membebani petak
 * berombak/berangin/berbadai, jadi jalurnya memutari cuaca buruk alih-alih
 * menembusnya; uji darat menolak ruas yang memotong pulau.
 *
 * `kehatian=ketat` menaikkan denda petak buruk dari 3× menjadi 25× (dan
 * bahaya dari 120× ke 600×). Disediakan karena "teraman" dan "tercepat" tidak
 * selalu jalur yang sama, dan yang berhak memilih di antara keduanya adalah
 * kapten, bukan aplikasi.
 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const wpp = u.searchParams.get('wpp')
  const target = (u.searchParams.get('target') ?? 'kecil') as Target
  const dariLat = lintang(u.searchParams.get('dariLat'))
  const dariLon = bujur(u.searchParams.get('dariLon'))
  const keLat = lintang(u.searchParams.get('keLat'))
  const keLon = bujur(u.searchParams.get('keLon'))
  // Kecepatan dibatasi 1–40 knot. Nol membuat jam tempuh tak hingga; nilai
  // negatif atau ratusan knot menghasilkan perkiraan yang tidak berarti
  // bagi kapal nelayan mana pun.
  const knRaw = angka(u.searchParams.get('kn'))
  const kecepatanKn = knRaw !== null && knRaw >= 1 && knRaw <= 40 ? knRaw : 8
  const kehatian = u.searchParams.get('kehatian') === 'ketat' ? 'ketat' : 'normal'

  if (!wpp || dariLat === null || dariLon === null || keLat === null || keLon === null)
    return NextResponse.json(
      {
        error:
          'Parameter wpp, dariLat, dariLon, keLat, keLon wajib dan harus koordinat yang sah.',
      },
      { status: 400 },
    )

  try {
    const grid = await gridRute(wpp, target)
    if (!grid || !grid.cells.length)
      return NextResponse.json({ error: 'Grid wilayah tidak tersedia.' }, { status: 404 })

    // Uji laut diturunkan dari grid run itu sendiri: petak yang muncul di
    // hasil run adalah laut menurut pipeline. Titik dianggap laut bila ada
    // pusat petak dalam satu petak darinya.
    //
    // Lebih kasar daripada poligon pantai, tetapi konsisten dengan tempat
    // rutenya memang boleh lewat — dan tanpa uji ini `cariRute` bebas
    // menarik ruas penyambung lurus menembus pulau.
    const kotak = new Map<string, true>()
    const langkah = grid.hexSizeDeg
    const kunci = (la: number, lo: number) =>
      `${Math.round(la / langkah)}:${Math.round(lo / langkah)}`
    for (const c of grid.cells) kotak.set(kunci(c.lat, c.lon), true)
    const diLaut = (la: number, lo: number) => {
      const bl = Math.round(la / langkah)
      const bo = Math.round(lo / langkah)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) if (kotak.has(`${bl + i}:${bo + j}`)) return true
      return false
    }

    const rute = cariRute(
      // `cariRute` hanya membaca id, lat, lon, waveM, windKn, precipMm, dan
      // weatherCode dari tiap sel — bukan skor, tier, atau variabel potensi.
      // Mengisi medan sisanya dengan angka karangan hanya untuk memuaskan
      // tipe akan menanam data palsu di jalur yang tidak membutuhkannya.
      grid.cells as unknown as FishingGroundCell[],
      { lat: dariLat, lon: dariLon },
      { lat: keLat, lon: keLon },
      {
        hexSizeDeg: grid.hexSizeDeg,
        kecepatanKn,
        kehatian,
        zonaAngin: grid.zonaAngin,
        diLaut,
      },
    )
    if (!rute) return NextResponse.json({ error: 'Rute tidak ditemukan.' }, { status: 404 })
    return NextResponse.json(rute)
  } catch (error) {
    console.error('rute gagal', error)
    return NextResponse.json({ error: 'Rute tidak tersedia.' }, { status: 503 })
  }
}
