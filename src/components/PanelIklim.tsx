'use client'

import { useState } from 'react'

/**
 * Panel iklim melayang — ringkasan kondisi SELURUH wilayah, bukan satu petak.
 *
 * Gunanya menjawab pertanyaan yang tidak bisa dijawab panel petak: "boleh
 * melaut hari ini atau tidak?" Petak yang dipilih bisa saja tenang sementara
 * sudut lain wilayahnya berombak tiga meter — dan kapal harus melewatinya.
 *
 * Karena itu MAKSIMUM ditampilkan sejajar dengan rata-rata. Rata-rata
 * menyembunyikan kantong berbahaya, dan kantong itulah yang menenggelamkan
 * kapal.
 */

export type Iklim = {
  berlaku: string | null
  nPetak: number
  ombakRataM: number | null
  ombakMaksM: number | null
  ombakBesar: number
  anginRataKn: number | null
  anginMaksKn: number | null
  arahVektorDeg: number | null
  mataAnginDominan: string | null
  cuacaDominan: string | null
  risiko: { aman: number; waspada: number; bahaya: number }
  /** Ditarik langsung dari Open-Meteo saat aplikasi dibuka — BUKAN dari
   *  pipeline, karena pipeline tidak mencatat ketiganya. null bila sumber
   *  luarnya tak terjangkau. */
  live: {
    arahDeg: number | null
    mataAngin: string | null
    anginKn: number | null
    hembusanKn: number | null
    cuaca: string | null
    rezimLabel: string
    pangsaBaratPct: number
    pangsaTimurPct: number
    jamJendela: number
    sumber: string
  } | null
  /** Di mana cuaca live diukur; `petakTerpilih` membedakannya dari titik acuan. */
  liveDi?: { lat: number; lon: number; petakTerpilih: boolean } | null
}

/** Ambang mengikuti kebiasaan peringatan pelayaran BMKG untuk perahu nelayan. */
function kelasOmbak(m: number | null): { label: string; warna: string } {
  if (m == null) return { label: 'tidak terbaca', warna: '#94a3b8' }
  if (m >= 2.5) return { label: 'berbahaya', warna: '#ef4444' }
  if (m >= 1.25) return { label: 'waspada', warna: '#eab308' }
  return { label: 'tenang', warna: '#16a34a' }
}

function kelasAngin(kn: number | null): { label: string; warna: string } {
  if (kn == null) return { label: 'tidak terbaca', warna: '#94a3b8' }
  if (kn >= 21) return { label: 'kencang', warna: '#ef4444' }
  if (kn >= 15) return { label: 'sedang', warna: '#eab308' }
  return { label: 'ringan', warna: '#16a34a' }
}

export function PanelIklim({
  data,
  galat,
  namaPetak = null,
}: {
  data: Iklim | null
  galat: string | null
  /** Petak yang sedang dipilih — jadi keterangan asal cuaca live. */
  namaPetak?: string | null
}) {
  // Terbuka sejak awal. Panel ini menjawab "boleh melaut hari ini atau
  // tidak", dan jawaban itu tidak boleh bersembunyi di balik satu ketukan —
  // pada WPP 573 hari ini 3.626 dari 5.150 petak berstatus waspada dengan
  // ombak sampai 2,13 m, dan kapten yang tidak membuka panel tidak akan
  // pernah melihatnya. Tetap bisa dilipat kalau menutupi peta.
  const [buka, setBuka] = useState(true)

  const ombak = kelasOmbak(data?.ombakMaksM ?? null)
  const angin = kelasAngin(data?.anginMaksKn ?? null)
  // Lampu status diambil dari yang TERBURUK di antara keduanya, bukan
  // rata-ratanya: satu alasan untuk tidak melaut sudah cukup.
  const buruk = data
    ? data.risiko.bahaya > 0
      ? { label: 'Ada area berbahaya', warna: '#ef4444' }
      : data.risiko.waspada > 0
        ? { label: 'Sebagian perlu waspada', warna: '#eab308' }
        : { label: 'Seluruh wilayah aman', warna: '#16a34a' }
    : { label: 'Memuat…', warna: '#94a3b8' }

  return (
    <div className="pointer-events-auto w-[168px]">
      <button
        onClick={() => setBuka((v) => !v)}
        className="box-cut kaca tekan w-full px-2.5 py-2 text-left"
        aria-expanded={buka}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: buruk.warna }}
          />
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[var(--navy)]">
            {namaPetak ? 'Cuaca petak ini' : 'Cuaca wilayah'}
          </span>
          <span className="shrink-0 text-[9px] text-zinc-400">{buka ? '▴' : '▾'}</span>
        </div>
        <p className="mt-0.5 text-[9px] leading-snug text-zinc-600">{buruk.label}</p>

        {!buka && data && (
          <div className="mt-1.5 flex gap-2 text-[9px] text-zinc-600">
            <span>
              Ombak <b className="text-[var(--navy)]">{data.ombakMaksM?.toFixed(1) ?? '—'} m</b>
            </span>
            <span>
              Angin <b className="text-[var(--navy)]">{Math.round(data.anginMaksKn ?? 0) || '—'} kn</b>
            </span>
          </div>
        )}
      </button>

      {buka && (
        // Tinggi dibatasi dan isinya digulir sendiri: panel ini melayang di
        // atas peta, dan tanpa batas ia bisa memanjang sampai menutupi lembar
        // bawah pada layar pendek.
        <div
          className="box-cut kaca mt-1.5 overflow-auto sembunyi-gulir px-2.5 py-2"
          style={{ maxHeight: 'min(46vh, 320px)' }}
        >
          {galat && <p className="text-[9px] text-red-600">{galat}</p>}
          {!galat && !data && <p className="text-[9px] text-zinc-500">Memuat…</p>}
          {data && (
            <>
              <Baris
                judul="Tinggi gelombang"
                rata={data.ombakRataM != null ? `${data.ombakRataM.toFixed(2)} m` : '—'}
                maks={data.ombakMaksM != null ? `${data.ombakMaksM.toFixed(2)} m` : '—'}
                kelas={ombak}
              />
              <Baris
                judul="Angin 10 m"
                rata={data.anginRataKn != null ? `${data.anginRataKn.toFixed(1)} kn` : '—'}
                maks={data.anginMaksKn != null ? `${data.anginMaksKn.toFixed(1)} kn` : '—'}
                kelas={angin}
              />

              <div className="mt-2 border-t border-black/10 pt-1.5">
                <p className="text-[9px] font-semibold text-zinc-500">
                  Sebaran risiko · {data.nPetak.toLocaleString('id-ID')} petak
                </p>
                <div className="mt-1 flex h-1.5 overflow-hidden">
                  {(
                    [
                      ['aman', '#16a34a'],
                      ['waspada', '#eab308'],
                      ['bahaya', '#ef4444'],
                    ] as const
                  ).map(([k, c]) => {
                    const v = data.risiko[k]
                    if (!v) return null
                    return (
                      <span
                        key={k}
                        title={`${k}: ${v} petak`}
                        style={{ background: c, width: `${(v / Math.max(1, data.nPetak)) * 100}%` }}
                      />
                    )
                  })}
                </div>
                <p className="mt-1 text-[9px] text-zinc-600">
                  {data.risiko.aman} aman · {data.risiko.waspada} waspada ·{' '}
                  {data.risiko.bahaya} bahaya
                </p>
                {data.ombakBesar > 0 && (
                  <p className="mt-0.5 text-[9px] font-semibold text-red-600">
                    {data.ombakBesar} petak berombak besar
                  </p>
                )}
              </div>

              {/* Arah angin, cuaca, dan rezim musiman — dari Open-Meteo,
                  ditarik saat aplikasi dibuka. Ditandai terpisah karena ia
                  BUKAN bagian dari perhitungan skor: pipeline tidak mencatat
                  ketiganya, jadi menampilkannya menyatu dengan angka pipeline
                  akan menyiratkan ia ikut menentukan peringkat petak. */}
              <div className="mt-2 border-t border-black/10 pt-1.5">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="text-[9px] font-semibold text-zinc-500">
                    Angin &amp; cuaca kini
                  </span>
                  <span className="box-cut bg-sky-100 px-1 text-[7px] font-bold text-sky-700">
                    LIVE
                  </span>
                </div>

                {data.live ? (
                  <>
                    <p className="text-[10px] text-zinc-700">
                      <b className="text-[var(--navy)]">{data.live.rezimLabel}</b>
                      {data.live.jamJendela > 0 && (
                        <span className="text-zinc-500">
                          {' '}· barat {data.live.pangsaBaratPct}% · timur{' '}
                          {data.live.pangsaTimurPct}%
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[9px] text-zinc-600">
                      Angin{' '}
                      {data.live.anginKn != null ? (
                        <b className="text-[var(--navy)]">
                          {data.live.anginKn.toFixed(1)} kn
                        </b>
                      ) : (
                        '—'
                      )}
                      {data.live.mataAngin && (
                        <> dari <b className="text-[var(--navy)]">{data.live.mataAngin}</b></>
                      )}
                      {data.live.arahDeg != null && (
                        <span className="text-zinc-500">
                          {' '}({Math.round(data.live.arahDeg)}°)
                        </span>
                      )}
                    </p>
                    {data.live.hembusanKn != null && (
                      <p className="mt-0.5 text-[9px] text-zinc-600">
                        Hembusan{' '}
                        <b className="text-[var(--navy)]">
                          {data.live.hembusanKn.toFixed(1)} kn
                        </b>
                      </p>
                    )}
                    {data.live.cuaca && (
                      <p
                        className="mt-0.5 text-[9px] font-semibold"
                        style={{
                          color: /badai|petir|deras/i.test(data.live.cuaca)
                            ? '#ef4444'
                            : '#334155',
                        }}
                      >
                        {data.live.cuaca}
                      </p>
                    )}
                    {/* Lokasi pengukuran ditulis apa adanya. Tanpa ini panel
                        terbaca seolah angin itu berlaku se-WPP, padahal ia
                        satu titik — dan kapten yang melihat "Gerimis" akan
                        mengira seluruh wilayahnya gerimis. */}
                    <p className="mt-1 text-[8px] leading-snug text-zinc-400">
                      {data.live.sumber} ·{' '}
                      {data.liveDi?.petakTerpilih
                        ? `di petak ${namaPetak ?? 'terpilih'}`
                        : 'di titik acuan wilayah'}
                    </p>
                  </>
                ) : (
                  <p className="text-[9px] text-amber-700">
                    Sumber angin tak terjangkau — coba lagi saat ada sinyal.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Baris({
  judul,
  rata,
  maks,
  kelas,
}: {
  judul: string
  rata: string
  maks: string
  kelas: { label: string; warna: string }
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] font-semibold text-zinc-500">{judul}</span>
        <span className="text-[9px] font-bold" style={{ color: kelas.warna }}>
          {kelas.label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-1 text-[10px]">
        <span className="text-zinc-600">
          rata <b className="text-[var(--navy)]">{rata}</b>
        </span>
        <span className="text-zinc-600">
          maks <b className="text-[var(--navy)]">{maks}</b>
        </span>
      </div>
    </div>
  )
}
