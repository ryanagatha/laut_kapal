'use client'

import { useState } from 'react'

/**
 * Lembar penilaian — ujung dari seluruh alur aplikasi ini.
 *
 * Diisi di atas kapal, sering dengan satu tangan dan layar basah, jadi
 * jalur tercepatnya hanya DUA ketukan: setuju/tidak, lalu banyak/sedang/sepi.
 * Jumlah tangkapan dan jenis ikan ada tetapi opsional dan tersembunyi di balik
 * satu ketukan lagi — menaruhnya di depan sebagai kolom wajib adalah cara
 * paling pasti membuat kapten menutup lembar ini tanpa mengisi apa pun, dan
 * penilaian yang tidak terkirim tidak memperbaiki model sama sekali.
 */

export type Hasil = 'banyak' | 'sedang' | 'sepi'

export type IsiValidasi = {
  setuju: boolean
  hasil: Hasil
  tangkapanKg: number | null
  jenisIkan: string | null
  catatan: string | null
}

const PILIHAN: { id: Hasil; label: string; sub: string; warna: string }[] = [
  { id: 'banyak', label: 'Banyak', sub: 'Tangkapan bagus', warna: 'var(--utama)' },
  { id: 'sedang', label: 'Sedang', sub: 'Biasa saja', warna: 'var(--cadangan)' },
  { id: 'sepi', label: 'Sepi', sub: 'Nyaris tidak ada', warna: 'var(--hindari)' },
]

export function LembarValidasi({
  namaArea,
  skorModel,
  kelasModel,
  manual = false,
  onBatal,
  onKirim,
  sibuk = false,
}: {
  namaArea: string
  skorModel: number | null
  kelasModel: string | null
  /** Mode Pencatatan Manual: tidak ada rekomendasi yang sedang diuji. */
  manual?: boolean
  onBatal: () => void
  onKirim: (isi: IsiValidasi) => void
  sibuk?: boolean
}) {
  const [hasil, setHasil] = useState<Hasil | null>(null)
  const [rinciTerbuka, setRinciTerbuka] = useState(false)
  const [kg, setKg] = useState('')
  const [jenis, setJenis] = useState('')
  const [catatan, setCatatan] = useState('')

  // "Setuju" diturunkan dari hasil, tidak ditanya terpisah.
  //
  // Model merekomendasikan area ini, jadi klaimnya sudah pasti "di sini
  // banyak ikan". Menanyakan setuju/tidak DAN banyak/sedang/sepi berarti
  // menanyakan hal yang sama dua kali, dan membuka peluang jawaban yang
  // bertentangan — "tidak setuju" + "banyak" tidak bisa ditafsirkan siapa pun.
  const setuju = hasil === 'banyak'

  return (
    <div className="flex flex-col">
      <div className="px-5 pb-1 pt-1">
        <p className="text-[10px] text-zinc-500">
          {manual ? 'Catatan di titik ini' : 'Penilaian Anda'}
        </p>
        <h2 className="mt-0.5 text-[18px] font-extrabold text-[var(--navy)]">{namaArea}</h2>
        {/* Pertanyaannya berbeda menurut mode, dan itu bukan sekadar kata.
            Pada mode rekomendasi kapten sedang MENGUJI klaim model, jadi
            skornya disebut. Pada pencatatan manual tidak ada klaim apa pun —
            menyebut skor di situ justru menyetir jawabannya ke arah angka
            yang baru saja ia baca. */}
        {manual ? (
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
            Bagaimana hasil tangkapan di titik ini?
          </p>
        ) : (
          skorModel !== null && (
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
              Model menilai area ini{' '}
              <b className="text-black">{Math.round(skorModel)} dari 100</b>
              {kelasModel ? ` (${kelasModel})` : ''}. Benar banyak ikannya?
            </p>
          )
        )}
      </div>

      <div className="flex gap-2 px-5 pt-4">
        {PILIHAN.map((p) => {
          const aktif = hasil === p.id
          return (
            <button
              key={p.id}
              onClick={() => setHasil(p.id)}
              aria-pressed={aktif}
              className="tekan sentuh flex-1 box-cut px-2 py-2.5 text-center"
              style={{
                background: aktif ? p.warna : '#f2f2f7',
                color: aktif ? '#fff' : '#000',
              }}
            >
              <span className="block text-[14px] font-bold">{p.label}</span>
              <span
                className="mt-0.5 block text-[10px]"
                style={{ color: aktif ? 'rgba(255,255,255,.8)' : '#8e8e93' }}
              >
                {p.sub}
              </span>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setRinciTerbuka((v) => !v)}
        className="sentuh mx-5 mt-3 flex items-center justify-between text-left"
      >
        <span className="text-[12px] font-semibold text-[var(--indigo)]">
          {rinciTerbuka ? 'Sembunyikan rincian' : 'Tambah rincian (opsional)'}
        </span>
        <span
          className="text-[10px] text-zinc-400"
          style={{ transform: rinciTerbuka ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
      </button>

      {rinciTerbuka && (
        <div className="mt-2 flex flex-col gap-2 px-5">
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-zinc-500">Tangkapan (kg)</span>
              <input
                value={kg}
                onChange={(e) => setKg(e.target.value.replace(/[^0-9.,]/g, ''))}
                inputMode="decimal"
                placeholder="—"
                className="w-full box-cut bg-white/80 px-3 py-2 border border-black/10"
              />
            </label>
            <label className="flex-[1.4]">
              <span className="mb-1 block text-[11px] text-zinc-500">Jenis ikan</span>
              <input
                value={jenis}
                onChange={(e) => setJenis(e.target.value)}
                placeholder="mis. layang, tongkol"
                className="w-full box-cut bg-white/80 px-3 py-2 border border-black/10"
              />
            </label>
          </div>
          <label>
            <span className="mb-1 block text-[11px] text-zinc-500">Catatan</span>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              placeholder="Arus kuat, banyak kapal lain, dll."
              className="w-full resize-none box-cut bg-white/80 px-3 py-2 border border-black/10"
            />
          </label>
        </div>
      )}

      <div
        className="mt-4 flex gap-2 px-5"
        style={{ paddingBottom: 'calc(var(--aman-bawah) + 16px)' }}
      >
        <button
          onClick={onBatal}
          className="tekan sentuh box-cut bg-white/80 px-4 text-[13px] font-semibold border border-black/10"
        >
          Nanti
        </button>
        <button
          disabled={!hasil || sibuk}
          onClick={() => {
            if (!hasil) return
            const n = Number(kg.replace(',', '.'))
            onKirim({
              setuju,
              hasil,
              tangkapanKg: Number.isFinite(n) && kg.trim() !== '' ? n : null,
              jenisIkan: jenis.trim() || null,
              catatan: catatan.trim() || null,
            })
          }}
          className="tekan sentuh flex-1 box-cut text-[14px] font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--indigo)' }}
        >
          {sibuk ? 'Menyimpan…' : manual ? 'Simpan catatan' : 'Kirim penilaian'}
        </button>
      </div>
    </div>
  )
}
