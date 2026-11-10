import { NextResponse } from 'next/server'
import {
  simpanValidasi,
  TabelBelumAda,
  type Hasil,
  type Mode,
  type Target,
} from '@/lib/kapten'

export const dynamic = 'force-dynamic'

const HASIL: Hasil[] = ['banyak', 'sedang', 'sepi']
const MODE: Mode[] = ['rekomendasi', 'eksplorasi', 'manual']

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Badan permintaan bukan JSON.' }, { status: 400 })
  }

  const wpp = String(body.wpp ?? '')
  const target = String(body.target ?? '') as Target
  const cellKey = String(body.cellKey ?? '')
  const hasil = String(body.hasil ?? '') as Hasil

  if (!wpp || !cellKey)
    return NextResponse.json({ error: 'wpp dan cellKey wajib.' }, { status: 400 })
  if (target !== 'kecil' && target !== 'besar')
    return NextResponse.json({ error: 'target harus kecil atau besar.' }, { status: 400 })
  if (!HASIL.includes(hasil))
    return NextResponse.json({ error: 'hasil harus banyak, sedang, atau sepi.' }, { status: 400 })
  if (typeof body.setuju !== 'boolean')
    return NextResponse.json({ error: 'setuju harus true atau false.' }, { status: 400 })

  const angka = (v: unknown) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const teks = (v: unknown, maks = 240) => {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s ? s.slice(0, maks) : null
  }

  try {
    const r = await simpanValidasi({
      runId: angka(body.runId),
      wpp,
      target,
      cellKey,
      cellLevel: teks(body.cellLevel, 16),
      skorModel: angka(body.skorModel),
      kelasModel: teks(body.kelasModel, 32),
      risikoModel: teks(body.risikoModel, 32),
      lat: angka(body.lat),
      lon: angka(body.lon),
      tibaPada: teks(body.tibaPada, 40),
      // `null` dipertahankan apa adanya — ia berarti "tidak diperiksa"
      // (mode manual), yang berbeda dari `false` ("diperiksa, tidak cocok").
      posisiCocok: typeof body.posisiCocok === 'boolean' ? body.posisiCocok : null,
      jarakKePetakKm: angka(body.jarakKePetakKm),
      setuju: body.setuju,
      hasil,
      tangkapanKg: angka(body.tangkapanKg),
      jenisIkan: teks(body.jenisIkan, 120),
      catatan: teks(body.catatan, 500),
      // Mode divalidasi dari daftar, bukan dipaksa ke salah satu.
      //
      // Versi sebelumnya menulis `mode === 'eksplorasi' ? 'eksplorasi' :
      // 'rekomendasi'`, yang diam-diam melabeli SETIAP catatan manual sebagai
      // 'rekomendasi'. Itu merusak justru guna mode manual: ia ada untuk jadi
      // pembanding tak-bias terhadap catatan yang model sendiri tunjuk, dan
      // kalau keduanya tercampur di bawah satu label, perbandingannya hilang
      // tanpa jejak apa pun di data.
      mode: MODE.includes(body.mode as Mode) ? (body.mode as Mode) : null,
      kapal: teks(body.kapal, 120),
      perangkat: teks(body.perangkat, 64),
    })
    return NextResponse.json(r)
  } catch (error) {
    if (error instanceof TabelBelumAda) {
      // 503, bukan 500: ini keadaan sementara yang akan hilang begitu DDL di
      // DATABASE-KAPTEN.md dijalankan. Klien menahan jawabannya di perangkat
      // dan mengirim ulang nanti, jadi penilaian kapten tidak hilang.
      return NextResponse.json(
        { error: 'Tabel validasi belum disiapkan di basis data.', tahan: true },
        { status: 503 },
      )
    }
    console.error('simpan validasi gagal', error)
    return NextResponse.json({ error: 'Gagal menyimpan penilaian.' }, { status: 503 })
  }
}
