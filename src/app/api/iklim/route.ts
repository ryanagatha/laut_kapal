import { NextResponse } from 'next/server'
import { iklimWpp, titikAcuanWpp, type Target } from '@/lib/kapten'
import { cuacaLive } from '@/lib/cuacaLive'
import { bujur, lintang } from '@/lib/param'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const wpp = u.searchParams.get('wpp')
  const target = (u.searchParams.get('target') ?? 'kecil') as Target
  // Koordinat petak yang sedang dipilih. Cuaca live ditarik DI SITU, bukan di
  // titik acuan wilayah: WPP 712 membentang >1.000 km, dan angin di ujung
  // baratnya tidak memberi tahu apa pun tentang ujung timurnya.
  // Koordinat petak yang sedang dipilih. Cuaca live ditarik DI SITU, bukan di
  // titik acuan wilayah: WPP 712 membentang >1.000 km, dan angin di ujung
  // baratnya tidak memberi tahu apa pun tentang ujung timurnya.
  const lat = lintang(u.searchParams.get('lat'))
  const lon = bujur(u.searchParams.get('lon'))
  const adaTitik = lat !== null && lon !== null
  if (!wpp) return NextResponse.json({ error: 'Parameter wpp wajib.' }, { status: 400 })
  try {
    const d = await iklimWpp(wpp, target)
    if (!d) return NextResponse.json({ error: 'Wilayah belum dihitung.' }, { status: 404 })
    // Arah angin, kode cuaca, dan rezim angin tidak ada di pipeline, jadi
    // ditarik langsung dari Open-Meteo — di petak yang dipilih bila ada,
    // selain itu di titik acuan wilayah. Dikembalikan di cabang `live` yang
    // terpisah supaya UI bisa menandainya: ia konteks cuaca hari ini, bukan
    // bagian dari perhitungan skor.
    const titik = adaTitik ? { lat: lat!, lon: lon! } : await titikAcuanWpp(wpp)
    const live = titik ? await cuacaLive(titik.lat, titik.lon) : null
    return NextResponse.json({
      ...d,
      live,
      /** Di mana cuaca live itu diukur — supaya panel tidak mengaku-aku. */
      liveDi: titik ? { ...titik, petakTerpilih: adaTitik } : null,
    })
  } catch (error) {
    console.error('iklim gagal', error)
    return NextResponse.json({ error: 'Ringkasan cuaca tidak tersedia.' }, { status: 503 })
  }
}
