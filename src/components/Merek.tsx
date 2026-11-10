'use client'

import Image from 'next/image'

/**
 * Kartu merek — Prominence × BRIN, lalu identitas produk.
 *
 * Susunannya mengikuti laut-statis: baris lembaga di atas dengan tanda silang
 * kolaborasi, garis pemisah, lalu nama produk. Tinggi optik kedua logo
 * disamakan — BRIN punya dua baris teks sehingga dibuat sedikit lebih tinggi
 * daripada Prominence agar keduanya terlihat sebanding, bukan sama persis
 * tingginya.
 */
export function Merek({ ringkas = false }: { ringkas?: boolean }) {
  if (ringkas)
    return (
      <div className="flex items-center gap-2">
        <Image
          src="/logo-prominence.png"
          alt="Prominence"
          width={1400}
          height={400}
          priority
          className="h-[13px] w-auto shrink-0"
        />
        <span className="shrink-0 text-[9px] font-semibold text-slate-400" aria-hidden>
          ×
        </span>
        <Image
          src="/logo-brin.png"
          alt="BRIN — Badan Riset dan Inovasi Nasional"
          width={571}
          height={186}
          priority
          className="h-[16px] w-auto shrink-0"
        />
      </div>
    )

  return (
    <div className="box-cut kaca px-4 py-3">
      <div className="flex items-center justify-center gap-2.5 border-b border-slate-200/80 pb-2.5">
        <Image
          src="/logo-prominence.png"
          alt="Prominence"
          width={1400}
          height={400}
          priority
          className="h-[18px] w-auto shrink-0"
        />
        <span className="shrink-0 text-[11px] font-semibold text-slate-400" aria-hidden>
          ×
        </span>
        <Image
          src="/logo-brin.png"
          alt="BRIN — Badan Riset dan Inovasi Nasional"
          width={571}
          height={186}
          priority
          className="h-[22px] w-auto shrink-0"
        />
      </div>
      {/* Logo produk adalah WORDMARK — gambarnya sudah memuat tulisan
          "SMART FISHERIES", jadi judul teks di sebelahnya dihapus: dua-duanya
          berdampingan terbaca sebagai nama yang tertulis dua kali.
          Dimensinya 2134×737; menyebut 512×512 seperti sebelumnya membuat
          next/image menghitung rasio yang salah dan logonya gepeng. */}
      <div className="pt-2.5">
        <Image
          src="/smart-fisheries-logo.png"
          alt="Smart Fisheries"
          width={2134}
          height={737}
          priority
          className="h-7 w-auto"
        />
        <p className="mt-1.5 text-[10px] leading-tight text-slate-500">
          Panduan area melaut untuk nakhoda
        </p>
      </div>
    </div>
  )
}
