'use client'

import { koordinat } from '@/lib/geo'

/**
 * Mode Pencatatan Manual.
 *
 * Bedanya dengan dua mode lain bukan tampilan, melainkan APA yang dicatat.
 * Rekomendasi dan Eksplorasi mencatat penilaian terhadap sebuah PETAK — unit
 * milik model. Mode ini mencatat sebuah TITIK: koordinat GPS tempat kapten
 * benar-benar berada dan jam ia berada di sana, lepas dari petak mana pun.
 *
 * Itu yang membuatnya paling berharga untuk menguji model. Dua mode lain
 * hanya menghasilkan catatan di tempat yang aplikasi tunjuk, jadi model
 * selalu diuji di lapangan pilihannya sendiri. Catatan manual dibuat karena
 * kapten kebetulan ada di situ — satu-satunya yang mendekati sampel tak-bias.
 */

export function PanelCatat({
  posisi,
  akurasiM,
  gpsGalat,
  pin,
  onPakaiGps,
  onBatalPin,
  onCatat,
  antre,
  jumlahCatatan,
}: {
  posisi: { lat: number; lon: number } | null
  akurasiM: number | null
  gpsGalat: string | null
  /** Titik yang dipilih dengan mengetuk peta, bila kapten tidak memakai GPS. */
  pin: { lat: number; lon: number } | null
  onPakaiGps: () => void
  onBatalPin: () => void
  onCatat: () => void
  antre: number
  jumlahCatatan: number
}) {
  const titik = pin ?? posisi
  const dariPin = pin != null

  return (
    <div style={{ paddingBottom: 'calc(var(--aman-bawah) + 14px)' }}>
      <div className="px-5 pb-2">
        <h2 className="text-[18px] font-extrabold text-[var(--navy)]">Catat di lokasi ini</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
          Tandai ada-tidaknya ikan di titik tempat Anda berada sekarang. Titik
          dan waktunya yang dicatat.
        </p>
      </div>

      <div className="box-cut mx-5 mb-2 bg-white/70 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {dariPin ? 'Titik yang ditandai di peta' : 'Posisi kapal (GPS)'}
          </span>
          {dariPin ? (
            <button
              onClick={onBatalPin}
              className="text-[11px] font-semibold text-[var(--indigo)]"
            >
              Pakai GPS
            </button>
          ) : (
            posisi && (
              <button
                onClick={onPakaiGps}
                className="text-[11px] font-semibold text-[var(--indigo)]"
              >
                Pusatkan
              </button>
            )
          )}
        </div>

        {titik ? (
          <>
            <p className="mt-1 text-[16px] font-extrabold text-[var(--navy)]">
              {koordinat(titik.lat, titik.lon)}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {titik.lat.toFixed(5)}, {titik.lon.toFixed(5)}
              {/* Akurasi GPS ditulis apa adanya. Titik dengan galat 500 m dan
                  titik dengan galat 5 m tidak sama nilainya sebagai data, dan
                  yang menilainya nanti berhak tahu bedanya. */}
              {!dariPin && akurasiM != null && (
                <span className={akurasiM > 100 ? 'text-amber-700' : ''}>
                  {' '}· akurasi ±{Math.round(akurasiM)} m
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[12px] text-amber-700">
            {gpsGalat ?? 'Menunggu sinyal GPS…'}
          </p>
        )}

        <p className="mt-1.5 text-[10px] text-zinc-500">
          Waktu dicatat otomatis saat Anda menekan tombol di bawah.
        </p>
      </div>

      <div className="mx-5">
        <button
          onClick={onCatat}
          disabled={!titik}
          className="box-cut sentuh tekan w-full text-[15px] font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--cadangan)', color: '#1f1300' }}
        >
          {titik ? 'Ada ikan di sini?' : 'Menunggu posisi…'}
        </button>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-500">
          Atau ketuk titik mana pun di peta untuk mencatat di sana — berguna
          saat Anda mengingat lokasi yang dilewati tadi.
        </p>
      </div>

      {(jumlahCatatan > 0 || antre > 0) && (
        <p className="mt-2 px-5 text-center text-[10px] text-zinc-500">
          {jumlahCatatan > 0 && `${jumlahCatatan} catatan sesi ini`}
          {jumlahCatatan > 0 && antre > 0 && ' · '}
          {antre > 0 && `${antre} menunggu terkirim`}
        </p>
      )}
    </div>
  )
}
