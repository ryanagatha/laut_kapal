import { NextResponse } from 'next/server'
import { areaTujuan, ringkasValidasi, type Target } from '@/lib/kapten'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const wpp = u.searchParams.get('wpp')
  const target = (u.searchParams.get('target') ?? 'kecil') as Target
  if (!wpp) return NextResponse.json({ error: 'Parameter wpp wajib.' }, { status: 400 })
  if (target !== 'kecil' && target !== 'besar')
    return NextResponse.json({ error: 'Target harus kecil atau besar.' }, { status: 400 })
  try {
    const hasil = await areaTujuan(wpp, target)
    if (!hasil)
      return NextResponse.json(
        { error: `Belum ada perhitungan untuk WPP ${wpp} ${target}.` },
        { status: 404 },
      )
    // Penanda "sudah pernah dinilai" ikut, supaya kapten tahu area mana yang
    // sudah diuji rekan lain dan mana yang belum ada yang mendatangi.
    const validasi = await ringkasValidasi(wpp, target)
    return NextResponse.json({ ...hasil, validasi })
  } catch (error) {
    console.error('area tujuan gagal', error)
    return NextResponse.json({ error: 'Area tujuan tidak tersedia.' }, { status: 503 })
  }
}
