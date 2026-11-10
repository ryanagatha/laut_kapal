import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kapten — Pilih Area Melaut',
  description:
    'Rekomendasi area penangkapan ikan untuk nakhoda: area terbaik hari ini, rute yang menghindari cuaca buruk, dan tempat menilai apakah rekomendasinya benar.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Kapten' },
}

/**
 * `viewportFit: 'cover'` + `maximumScale: 1`.
 *
 * Yang pertama membuat peta mengisi sampai ke tepi layar berponi; padding
 * aman ditangani CSS lewat env(safe-area-inset-*). Yang kedua mencegah Safari
 * iOS men-zoom seluruh halaman saat kapten menyentuh kolom isian — zoom itu
 * menggeser peta dan menyulitkan mengembalikannya dengan satu tangan.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f2f2f7',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
