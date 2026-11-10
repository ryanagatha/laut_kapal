'use client'

import { Merek } from './Merek'

/**
 * Langkah kedua: cara kerjanya.
 *
 * Dua mode ini bukan sekadar dua tampilan. Mode Rekomendasi menguji model di
 * tempat yang model sendiri tunjuk; mode Eksplorasi membiarkan kapten memilih
 * petak mana pun — termasuk yang tidak direkomendasikan, dan yang sudah ia
 * yakini bagus dari pengalaman. Tanpa yang kedua, satu-satunya umpan balik
 * yang terkumpul hanya tentang area pilihan model sendiri, dan model tidak
 * akan pernah tahu apa yang ia lewatkan.
 */

export type Mode = 'rekomendasi' | 'eksplorasi' | 'catat'

export function PilihMode({
  namaWpp,
  targetLabel,
  onPilih,
  onKembali,
}: {
  namaWpp: string
  targetLabel: string
  onPilih: (m: Mode) => void
  onKembali: () => void
}) {
  return (
    <div
      className="flex h-full flex-col bg-[#eef2f6]"
      style={{ paddingTop: 'calc(var(--aman-atas) + 14px)' }}
    >
      <div className="px-4 pb-3">
        <Merek />
      </div>

      <div className="px-5 pb-5">
        <button onClick={onKembali} className="sentuh -ml-1 flex items-center gap-1 text-[13px] text-[var(--indigo)]">
          ‹ Ganti wilayah
        </button>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--indigo)]">
          Langkah 2 dari 2
        </p>
        <h1 className="mt-1.5 text-[24px] leading-[1.15] text-[var(--navy)]">
          Mau melaut
          <br />
          dengan cara apa?
        </h1>
        <p className="mt-2 text-[12px] text-zinc-500">
          {namaWpp} · {targetLabel}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-auto sembunyi-gulir px-5">
        <Kartu
          judul="Rekomendasi"
          ringkas="Terima daftar area terbaik hari ini"
          rinci="Area diurutkan menurut hasil model, lengkap dengan jarak dari kapal, kondisi laut, dan rute yang menghindari cuaca buruk."
          warna="var(--indigo)"
          ikon={<IkonBintang />}
          onClick={() => onPilih('rekomendasi')}
        />
        <Kartu
          judul="Eksplorasi"
          ringkas="Pilih sendiri petak di peta"
          rinci="Seluruh petak wilayah tergambar. Ketuk petak mana pun untuk melihat penilaian model di sana — termasuk yang tidak ia rekomendasikan."
          warna="var(--utama)"
          ikon={<IkonKompas />}
          onClick={() => onPilih('eksplorasi')}
        />
        <Kartu
          judul="Pencatatan Manual"
          ringkas="Tandai ada-tidaknya ikan di titik Anda"
          rinci="Catat titik GPS dan waktunya saat Anda sedang di lokasi — lepas dari rekomendasi mana pun. Catatan inilah yang paling jujur menguji model, karena Anda ke sana bukan karena disuruh aplikasi."
          warna="var(--cadangan)"
          ikon={<IkonPin />}
          onClick={() => onPilih('catat')}
        />
      </div>

      <p
        className="px-7 pt-4 text-center text-[11px] leading-relaxed text-zinc-500"
        style={{ paddingBottom: 'calc(var(--aman-bawah) + 22px)' }}
      >
        Setelah sampai di lokasi, Anda akan diminta menilai: benar banyak ikan
        atau tidak. Penilaian itu yang memperbaiki rekomendasi berikutnya.
      </p>
    </div>
  )
}

function Kartu({
  judul,
  ringkas,
  rinci,
  warna,
  ikon,
  onClick,
}: {
  judul: string
  ringkas: string
  rinci: string
  warna: string
  ikon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="box-cut kaca tekan w-full p-4 text-left">
      <div className="flex items-center gap-3">
        <span
          className="box-cut flex h-11 w-11 shrink-0 items-center justify-center text-white"
          style={{ background: warna }}
        >
          {ikon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-bold text-[var(--navy)]">{judul}</span>
          <span className="block text-[12px] text-zinc-500">{ringkas}</span>
        </span>
        <span className="shrink-0 text-[16px] text-zinc-300">›</span>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-600">{rinci}</p>
    </button>
  )
}

function IkonBintang() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.4 1.3 6.3L12 16.8 6.4 19.9l1.3-6.3L2.9 9.2l6.4-.7z" />
    </svg>
  )
}

function IkonPin() {
  return (
    <svg
      width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IkonKompas() {
  return (
    <svg
      width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z" fill="currentColor" stroke="none" />
    </svg>
  )
}
