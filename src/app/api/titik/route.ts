import { NextResponse } from 'next/server'
import { titikTerdekat, type Target } from '@/lib/kapten'
import { bujur, lintang } from '@/lib/param'

export const dynamic = 'force-dynamic'

/** Mode Eksplorasi: kapten menunjuk sembarang titik di peta. */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const wpp = u.searchParams.get('wpp')
  const target = (u.searchParams.get('target') ?? 'kecil') as Target
  const lat = lintang(u.searchParams.get('lat'))
  const lon = bujur(u.searchParams.get('lon'))
  // `?cell=` → baca petak itu persis. Dipakai saat kapten mengetuk heksagon,
  // supaya yang dibacakan adalah petak yang disentuh — bukan tetangga yang
  // kebetulan lebih halus.
  const cell = u.searchParams.get('cell')
  if (!wpp || lat === null || lon === null)
    return NextResponse.json(
      { error: 'Parameter wpp, lat, lon wajib dan harus koordinat yang sah.' },
      { status: 400 },
    )
  try {
    const t = await titikTerdekat(wpp, target, lat, lon, cell)
    if (!t) return NextResponse.json({ error: 'Titik di luar wilayah terhitung.' }, { status: 404 })
    return NextResponse.json(t)
  } catch (error) {
    console.error('titik gagal', error)
    return NextResponse.json({ error: 'Keterangan titik tidak tersedia.' }, { status: 503 })
  }
}
