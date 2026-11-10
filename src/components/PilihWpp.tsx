'use client'

import { Merek } from './Merek'

/**
 * Langkah pertama: wilayah.
 *
 * Didahulukan sebelum memilih mode karena wilayah menentukan ADA ATAU TIDAK
 * datanya, sementara mode hanya menentukan cara menelusurinya. Kapten yang
 * memilih mode lebih dulu lalu menemukan wilayahnya belum dihitung sudah
 * menempuh satu langkah sia-sia.
 *
 * Daftarnya datang dari basis data, bukan dari daftar tetap di kode: wilayah
 * yang belum pernah berhasil dihitung tidak muncul sama sekali, jadi tidak ada
 * pilihan yang menjanjikan sesuatu yang tidak ada.
 */

export type Wilayah = { kode: string; nama: string; perairan: string; berlaku?: string | null }
export type Target = 'kecil' | 'besar'

/**
 * Pecah keterangan cakupan jadi daftar perairan yang bisa dibaca sekilas.
 *
 * Nilai mentahnya satu kalimat panjang — "Meliputi Perairan Samudera Hindia
 * sebelah Selatan Jawa hingga sebelah Selatan Nusa Tenggara, Laut Sawu dan
 * Laut Timor" — yang pada lebar ponsel terpotong di tengah dan tidak
 * memberi tahu apa pun. Dipecah per koma/"dan", kapten bisa menemukan nama
 * laut yang ia kenal tanpa membaca seluruh kalimatnya.
 */
function pecahPerairan(teks: string): string[] {
  return teks
    .replace(/^Meliputi\s+(Perairan\s+)?/i, '')
    .split(/,\s*|\s+dan\s+/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
}

export function PilihWpp({
  daftar,
  memuat,
  galat,
  target,
  onTarget,
  onPilih,
}: {
  daftar: Wilayah[]
  memuat: boolean
  galat: string | null
  target: Target
  onTarget: (t: Target) => void
  onPilih: (kode: string) => void
}) {
  return (
    <div
      className="flex h-full flex-col bg-[#eef2f6]"
      style={{ paddingTop: 'calc(var(--aman-atas) + 14px)' }}
    >
      <div className="px-4 pb-3">
        <Merek />
      </div>

      <div className="px-5 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--indigo)]">
          Langkah 1 dari 2
        </p>
        <h2 className="mt-1 text-[24px] leading-[1.15] text-[var(--navy)]">
          Wilayah mana yang akan dilaut?
        </h2>
      </div>

      <div className="flex gap-1.5 px-5 pb-3">
        {(['kecil', 'besar'] as Target[]).map((t) => (
          <button
            key={t}
            onClick={() => onTarget(t)}
            aria-pressed={target === t}
            className="box-cut sentuh tekan flex-1 px-3 text-[12px] font-semibold"
            style={{
              background: target === t ? 'var(--indigo)' : 'rgba(255,255,255,0.75)',
              color: target === t ? '#fff' : '#334155',
              border: target === t ? 'none' : '1px solid rgba(0,33,71,0.12)',
            }}
          >
            Pelagis {t === 'kecil' ? 'Kecil' : 'Besar'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto sembunyi-gulir px-5 pb-6">
        {memuat && <p className="py-8 text-center text-[13px] text-zinc-500">Memuat wilayah…</p>}
        {galat && <p className="py-8 text-center text-[13px] text-red-600">{galat}</p>}
        {!memuat && !galat && daftar.length === 0 && (
          <p className="py-8 text-center text-[13px] text-zinc-500">
            Belum ada wilayah yang selesai dihitung.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {daftar.map((w) => {
            const perairan = pecahPerairan(w.perairan)
            return (
              <button
                key={w.kode}
                onClick={() => onPilih(w.kode)}
                className="box-cut kaca tekan px-4 py-3.5 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="box-cut flex h-11 w-11 shrink-0 items-center justify-center text-[13px] font-extrabold text-white"
                    style={{ background: 'var(--navy)' }}
                  >
                    {w.kode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-[var(--navy)]">{w.nama}</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {perairan.length} perairan
                    </span>
                  </span>
                  <span className="shrink-0 text-[16px] text-zinc-300">›</span>
                </div>

                {/* Nama perairannya ditulis utuh, bukan dipotong dengan elipsis.
                    Ini satu-satunya tempat kapten bisa memastikan wilayah yang
                    ia pilih memang mencakup laut tempatnya biasa melaut. */}
                {perairan.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {perairan.map((p) => (
                      <span
                        key={p}
                        className="box-cut bg-white/80 px-1.5 py-0.5 text-[10px] leading-snug text-zinc-600"
                        style={{ border: '1px solid rgba(0,33,71,0.08)' }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
