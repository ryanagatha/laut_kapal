import { NextResponse } from 'next/server'
import { daftarWpp } from '@/lib/kapten'

export const dynamic = 'force-dynamic'

/** Wilayah yang benar-benar punya run sukses. Tanpa daftar tetap: wilayah
 *  yang belum pernah dihitung tidak boleh muncul sebagai pilihan. */
export async function GET() {
  try {
    return NextResponse.json({ wpp: await daftarWpp() })
  } catch (error) {
    console.error('daftar wpp gagal', error)
    return NextResponse.json({ error: 'Daftar wilayah tidak tersedia.' }, { status: 503 })
  }
}
