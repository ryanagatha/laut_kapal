/**
 * Warna heksagon — DISALIN dari `src/lib/utils.ts` + `sim/priority.ts`
 * laut-statis, nilai demi nilai.
 *
 * Disalin, bukan diimpor: kedua aplikasi berbeda repositori, tetapi satu
 * warna harus berarti satu hal yang sama di keduanya. Kapten yang melihat
 * petak hijau tua di ponselnya dan analis yang melihat petak hijau tua di
 * layarnya harus sedang membicarakan petak yang sama.
 */

export const WARNA_KUADRAN: Record<string, string> = {
  utama: '#16a34a',
  ekspedisi: '#2e3192',
  cadangan: '#eab308',
  hindari: '#ef4444',
}

export const LABEL_KUADRAN: Record<string, string> = {
  utama: 'Prioritas Utama',
  ekspedisi: 'Ekspedisi',
  cadangan: 'Cadangan Dekat',
  hindari: 'Tidak Disarankan',
}

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r1, g1, b1] = p(a)
  const [r2, g2, b2] = p(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return (
    '#' +
    [m(r1, r2), m(g1, g2), m(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')
  )
}

/**
 * Gradasi di dalam satu kuadran: warna kuadran tetap jadi identitas, indeks
 * prioritas menggeser terang-gelapnya. Rentang dipatok 20–95 supaya sebaran
 * harian yang sempit tetap menghasilkan kontras yang terlihat.
 */
export function warnaPetak(kelas: string, prioritas: number): string {
  const base = WARNA_KUADRAN[kelas] ?? '#2e3192'
  const t = Math.max(0, Math.min(1, (prioritas - 20) / 75))
  if (t < 0.5) return mixHex(mixHex(base, '#ffffff', 0.45), base, t * 2)
  return mixHex(base, mixHex(base, '#0b0e2e', 0.62), (t - 0.5) * 2)
}
