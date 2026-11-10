import { NextResponse } from 'next/server'
import { petakWpp, type Target } from '@/lib/kapten'

export const dynamic = 'force-dynamic'

/**
 * Seluruh petak heksagon satu wilayah — latar peta.
 *
 * Terpisah dari `/api/area` karena perannya berbeda: `area` adalah DAFTAR
 * PILIHAN (12 teratas, yang `hindari` dibuang), sementara ini LATAR: semua
 * petak, termasuk yang buruk. Kapten perlu keduanya — mana yang bisa dituju,
 * dan seperti apa seluruh perairannya. Peta yang hanya menampilkan petak
 * bagus membuat laut tampak seragam bagus.
 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const wpp = u.searchParams.get('wpp')
  const target = (u.searchParams.get('target') ?? 'kecil') as Target
  // `?induk=<cell_key>` → layer 2 km di dalam petak besar itu (drill-down).
  const induk = u.searchParams.get('induk')
  if (!wpp) return NextResponse.json({ error: 'Parameter wpp wajib.' }, { status: 400 })
  try {
    const d = await petakWpp(wpp, target, induk)
    if (!d) return NextResponse.json({ error: 'Wilayah belum dihitung.' }, { status: 404 })
    return NextResponse.json(d)
  } catch (error) {
    console.error('petak gagal', error)
    return NextResponse.json({ error: 'Petak tidak tersedia.' }, { status: 503 })
  }
}
