'use client'

import { lamaManusiawi, jamTempuh } from '@/lib/geo'

/**
 * Penjagaan posisi sebelum menilai petak.
 *
 * Validasi dari orang yang belum mendatangi petaknya tidak bernilai sebagai
 * pengujian model — ia hanya pendapat tentang angka di layar. Karena itu
 * posisi GPS diperiksa lebih dulu.
 *
 * TAPI TIDAK DIKUNCI MATI. GPS gagal di laut, akurasinya bisa ratusan meter,
 * dan mengunci kapten yang MEMANG berada di sana sama merusaknya dengan
 * menerima catatan dari orang yang tidak pernah ke situ. Jadi: diperingatkan
 * dengan jarak yang sebenarnya, boleh dilanjutkan dengan penegasan, dan
 * penegasan itu ikut tercatat ke basis data lewat `posisi_cocok = false`.
 *
 * Yang menilai datanya nanti bisa menyaring sendiri; yang tidak boleh terjadi
 * adalah perbedaan itu hilang tanpa jejak.
 */

export type Posisi =
  | { keadaan: 'cocok' }
  | { keadaan: 'jauh'; jarakKm: number }
  | { keadaan: 'tanpa-gps'; sebab: string }

export function PeringatanPosisi({
  posisi,
  namaPetak,
  onBatal,
  onTetapLanjut,
}: {
  posisi: Posisi
  namaPetak: string
  onBatal: () => void
  onTetapLanjut: () => void
}) {
  const tanpaGps = posisi.keadaan === 'tanpa-gps'
  return (
    <div style={{ paddingBottom: 'calc(var(--aman-bawah) + 14px)' }}>
      <div className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="box-cut flex h-7 w-7 shrink-0 items-center justify-center text-[15px] font-bold text-white"
            style={{ background: 'var(--cadangan)', color: '#1f1300' }}
          >
            !
          </span>
          <h2 className="text-[16px] font-extrabold text-[var(--navy)]">
            {tanpaGps ? 'Posisi belum terbaca' : 'Anda belum di petak ini'}
          </h2>
        </div>

        {posisi.keadaan === 'jauh' && (
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-700">
            Petak <b>{namaPetak}</b> masih{' '}
            <b className="text-[var(--navy)]">{Math.round(posisi.jarakKm)} km</b> dari
            posisi Anda — sekitar {lamaManusiawi(jamTempuh(posisi.jarakKm, 8))} pada 8 knot.
          </p>
        )}
        {tanpaGps && (
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-700">
            {posisi.sebab} Tanpa posisi, aplikasi tidak bisa memastikan Anda
            berada di petak <b>{namaPetak}</b>.
          </p>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Penilaian dipakai untuk menguji ketepatan model, jadi yang berarti
          hanya penilaian dari orang yang benar-benar menangkap ikan di sana.
          Kalau Anda memang sedang di lokasi dan GPS-nya yang meleset, lanjutkan
          saja — catatannya akan ditandai bahwa posisinya tidak terkonfirmasi.
        </p>
      </div>

      <div className="mx-5 flex flex-col gap-2">
        <button
          onClick={onBatal}
          className="box-cut sentuh tekan w-full text-[14px] font-bold text-white"
          style={{ background: 'var(--indigo)' }}
        >
          Belum, saya catat nanti
        </button>
        <button
          onClick={onTetapLanjut}
          className="box-cut sentuh tekan w-full bg-white/80 text-[13px] font-semibold text-zinc-700"
          style={{ border: '1px solid rgba(0,33,71,0.14)' }}
        >
          Saya memang di sini — lanjutkan
        </button>
      </div>
    </div>
  )
}
