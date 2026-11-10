/**
 * Antrean validasi di perangkat.
 *
 * Penilaian kapten diisi di laut, tempat sinyal paling sering tidak ada —
 * dan tabel tujuannya pun belum tentu sudah dibuat (lihat DATABASE-KAPTEN.md).
 * Mengirim langsung lalu menampilkan "gagal" berarti membuang satu-satunya
 * pengamatan lapangan yang dipunyai model ini, dan kapten tidak akan mengetik
 * ulang jawaban yang sama setibanya di darat.
 *
 * Jadi setiap penilaian ditulis ke perangkat LEBIH DULU, lalu dikirim. Yang
 * gagal tetap mengantre dan dicoba lagi saat aplikasi dibuka atau jaringan
 * kembali.
 */

const KUNCI = 'kapten.antrean.validasi.v1'
const KUNCI_PERANGKAT = 'kapten.perangkat.v1'

export type Antre = Record<string, unknown> & { _id: string; _dibuat: string }

function bacaSemua(): Antre[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const r = JSON.parse(localStorage.getItem(KUNCI) ?? '[]')
    return Array.isArray(r) ? r : []
  } catch {
    return []
  }
}

function tulisSemua(a: Antre[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KUNCI, JSON.stringify(a))
  } catch {
    // Kuota penuh. Lebih baik kehilangan yang terlama daripada gagal menyimpan
    // yang baru saja diisi kapten di depan layar.
    try {
      localStorage.setItem(KUNCI, JSON.stringify(a.slice(-20)))
    } catch {
      /* menyerah diam-diam; UI tetap mencoba mengirim langsung */
    }
  }
}

/** Penanda perangkat, dibuat sekali. Dipakai menolak kiriman ganda di basis
 *  data — bukan untuk mengenali orangnya. */
export function idPerangkat(): string {
  if (typeof localStorage === 'undefined') return 'tanpa-perangkat'
  let v = localStorage.getItem(KUNCI_PERANGKAT)
  if (!v) {
    v =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    localStorage.setItem(KUNCI_PERANGKAT, v)
  }
  return v
}

export function jumlahAntre(): number {
  return bacaSemua().length
}

export function antrekan(muatan: Record<string, unknown>): Antre {
  const baris: Antre = {
    ...muatan,
    _id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    _dibuat: new Date().toISOString(),
  }
  tulisSemua([...bacaSemua(), baris])
  return baris
}

function buang(id: string) {
  tulisSemua(bacaSemua().filter((x) => x._id !== id))
}

/**
 * Coba kirim seluruh antrean.
 *
 * Hanya baris yang benar-benar diterima server yang dibuang. Galat 4xx selain
 * 409 juga dibuang: muatan yang ditolak karena cacat tidak akan pernah
 * diterima berapa kali pun dicoba, dan membiarkannya berarti antrean macet
 * selamanya di baris yang sama.
 */
export async function kirimAntrean(): Promise<{ terkirim: number; sisa: number }> {
  const semua = bacaSemua()
  let terkirim = 0
  for (const baris of semua) {
    const { _id, _dibuat, ...muatan } = baris
    void _dibuat
    try {
      const res = await fetch('/api/validasi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(muatan),
      })
      if (res.ok) {
        buang(_id)
        terkirim++
        continue
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 409) {
        buang(_id)
        continue
      }
      // 5xx termasuk 503 "tabel belum disiapkan" — tetap ditahan.
    } catch {
      // Jaringan mati. Berhenti mencoba sisanya: kalau satu gagal karena
      // offline, sisanya pasti gagal juga, dan meneruskan hanya menghabiskan
      // baterai.
      break
    }
  }
  return { terkirim, sisa: jumlahAntre() }
}
