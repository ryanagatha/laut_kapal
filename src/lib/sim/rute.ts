import type { FishingGroundCell } from './types'

// Rute pelayaran dari posisi kapal ke area prioritas, MENGHINDARI heksagon
// bercuaca buruk.
//
// KENAPA BUKAN GARIS LURUS
//
// Di laut tidak ada jalan, jadi godaannya menggambar garis lurus dari kapal ke
// tujuan. Tapi garis lurus bisa menembus petak yang anginnya 25 knot dan
// ombaknya tiga meter — persis yang membuat kapal kecil tidak pulang. Rute di
// sini karena itu dicari di atas grid heksagon yang sudah kita punya: tiap sel
// membawa windKn, waveM, precipMm, dan weatherCode dari sumber yang sama
// dengan yang menilai potensinya.
//
// KENAPA A*, BUKAN SEKADAR MENGHINDAR SAAT MENABRAK
//
// Menghindar secara lokal ("kalau petak di depan buruk, belok") gampang
// terjebak: ia bisa menyusuri tepi badai sepanjang ratusan kilometer padahal
// memutar lebih awal jauh lebih pendek. A* memutuskan dengan melihat seluruh
// medan sekaligus, jadi hasilnya rute terpendek yang benar-benar aman, bukan
// rute pertama yang kebetulan tidak menabrak.
//
// BIAYA, BUKAN TEMBOK
//
// Petak `bahaya` tidak dilarang mutlak melainkan diberi biaya sangat mahal.
// Bedanya terasa ketika badai menutup SELURUH jalan: dengan tembok, pencarian
// gagal dan pengguna hanya dapat "tidak ada rute" — tidak berguna bagi orang
// yang tetap harus memutuskan. Dengan biaya mahal, rute tetap ketemu, ditandai
// terpaksa melintasi cuaca buruk, dan nakhoda yang memutuskan.

export type KelasCuaca = 'aman' | 'waspada' | 'bahaya'

export interface AmbangCuaca {
  anginWaspadaKn: number
  anginBahayaKn: number
  ombakWaspadaM: number
  ombakBahayaM: number
  hujanWaspadaMm: number
  hujanBahayaMm: number
}

// Ambang untuk kapal penangkap ikan kecil–menengah, mengikuti kebiasaan
// peringatan pelayaran BMKG: gelombang 1,25–2,5 m sudah "waspada" bagi perahu
// nelayan, di atas 2,5 m "berbahaya". Angin 15 knot mulai menyulitkan
// pengoperasian alat tangkap; 21 knot (Beaufort 6) batas umum melaut.
export const AMBANG_BAWAAN: AmbangCuaca = {
  anginWaspadaKn: 15,
  anginBahayaKn: 21,
  ombakWaspadaM: 1.25,
  ombakBahayaM: 2.5,
  hujanWaspadaMm: 2.5,
  hujanBahayaMm: 10,
}

/** Kode cuaca WMO yang dipakai Open-Meteo. 95–99 = badai petir. */
function badaiPetir(code?: number): boolean {
  return code !== undefined && code >= 95
}

export interface AlasanCuaca {
  kelas: KelasCuaca
  alasan: string[]
}

/** Kelas cuaca satu sel, beserta alasannya — supaya warna di peta bisa
 *  dipertanggungjawabkan, bukan sekadar merah tanpa keterangan. */
export function kelasCuaca(
  cell: FishingGroundCell,
  ambang: AmbangCuaca = AMBANG_BAWAAN
): AlasanCuaca {
  const alasan: string[] = []
  let kelas: KelasCuaca = 'aman'

  const naikkan = (k: KelasCuaca) => {
    if (k === 'bahaya' || (k === 'waspada' && kelas === 'aman')) kelas = k
  }

  const angin = cell.windKn
  if (angin !== undefined) {
    if (angin >= ambang.anginBahayaKn) {
      naikkan('bahaya'); alasan.push(`angin ${angin.toFixed(1)} kn`)
    } else if (angin >= ambang.anginWaspadaKn) {
      naikkan('waspada'); alasan.push(`angin ${angin.toFixed(1)} kn`)
    }
  }

  const ombak = cell.waveM
  if (ombak !== undefined) {
    if (ombak >= ambang.ombakBahayaM) {
      naikkan('bahaya'); alasan.push(`ombak ${ombak.toFixed(2)} m`)
    } else if (ombak >= ambang.ombakWaspadaM) {
      naikkan('waspada'); alasan.push(`ombak ${ombak.toFixed(2)} m`)
    }
  }

  const hujan = cell.precipMm
  if (hujan !== undefined) {
    if (hujan >= ambang.hujanBahayaMm) {
      naikkan('bahaya'); alasan.push(`hujan ${hujan.toFixed(1)} mm`)
    } else if (hujan >= ambang.hujanWaspadaMm) {
      naikkan('waspada'); alasan.push(`hujan ${hujan.toFixed(1)} mm`)
    }
  }

  if (badaiPetir(cell.weatherCode)) {
    naikkan('bahaya'); alasan.push('badai petir')
  }

  return { kelas, alasan }
}

/**
 * Skor keburukan cuaca 0–1, kontinu.
 *
 * `kelasCuaca` menjawab "boleh lewat atau tidak" — cukup untuk memutuskan,
 * tetapi tidak untuk MENJELASKAN. Dua petak sama-sama 'waspada' bisa berbeda
 * jauh: satu berangin 15 knot, satu lagi 20 knot dengan ombak 2,4 m. Di peta
 * keduanya akan berwarna sama persis, dan pengguna yang melihat rute membelok
 * tidak punya cara tahu kenapa belokannya ke arah sana dan bukan sebaliknya.
 *
 * Skor ini mengambil komponen TERPARAH, bukan rata-ratanya: petak dengan angin
 * tenang tetapi ombak tiga meter tetap harus tampak merah. Merata-ratakan akan
 * menenggelamkan satu bahaya nyata di antara beberapa nilai yang aman.
 */
export function skorBuruk(
  cell: FishingGroundCell,
  ambang: AmbangCuaca = AMBANG_BAWAAN
): number {
  // Tiap komponen dipetakan: di ambang waspada → 0,5; di ambang bahaya → 1,0.
  const skala = (v: number | undefined, waspada: number, bahaya: number): number => {
    if (v === undefined || !isFinite(v)) return 0
    if (v <= 0) return 0
    if (v < waspada) return Math.max(0, (v / waspada) * 0.5 * 0.6)
    if (v < bahaya) return 0.5 + ((v - waspada) / (bahaya - waspada)) * 0.5
    return 1
  }
  const nilai = [
    skala(cell.windKn, ambang.anginWaspadaKn, ambang.anginBahayaKn),
    skala(cell.waveM, ambang.ombakWaspadaM, ambang.ombakBahayaM),
    skala(cell.precipMm, ambang.hujanWaspadaMm, ambang.hujanBahayaMm),
    badaiPetir(cell.weatherCode) ? 1 : 0,
  ]
  return Math.min(1, Math.max(...nilai))
}

const R_BUMI_KM = 6371.0088

export function jarakKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const la = a.lat * rad
  const lb = b.lat * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Arah kompas dari a ke b, derajat dari utara searah jarum jam. */
export function bearingDeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const rad = Math.PI / 180
  const la = a.lat * rad
  const lb = b.lat * rad
  const dLon = (b.lon - a.lon) * rad
  const y = Math.sin(dLon) * Math.cos(lb)
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLon)
  return (Math.atan2(y, x) / rad + 360) % 360
}

const MATA_ANGIN = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL']
export function mataAngin(deg: number): string {
  return MATA_ANGIN[Math.round(deg / 45) % 8]
}

// Pengali biaya per kelas. `bahaya` sengaja besar tapi berhingga — lihat
// catatan "BIAYA, BUKAN TEMBOK" di atas.
//
// DUA TINGKAT KEHATI-HATIAN
//
// `normal` cocok untuk kapal yang memang biasa melaut pada kondisi waspada:
// memutar hanya bila jalannya tidak jauh lebih panjang. `ketat` untuk perahu
// kecil atau nakhoda yang memilih tidak ambil risiko sama sekali — ia rela
// memutar berkali lipat demi tidak menyentuh petak waspada.
//
// Bedanya nyata, bukan hiasan: terukur di WPP 712 pada 116 petak waspada,
// tingkat `normal` tidak mengubah satu pun rute dari jalur terpendek, karena
// memutari sabuk cuaca itu lebih mahal daripada menembusnya pada bobot 3×.
export type Kehatian = 'normal' | 'ketat'

const BIAYA: Record<Kehatian, Record<KelasCuaca, number>> = {
  normal: { aman: 1, waspada: 3, bahaya: 120 },
  ketat: { aman: 1, waspada: 25, bahaya: 600 },
}

export interface TitikRute {
  lat: number
  lon: number
  cellId?: string
  kelas: KelasCuaca
  alasan: string[]
}

export interface HasilRute {
  titik: TitikRute[]
  jarakKm: number
  jarakLurusKm: number
  bearingAwal: number
  jamTempuh: number
  kelasTerburuk: KelasCuaca
  nSelDihindari: number
  melintasiBahaya: boolean
  catatan: string[]
  /** −1 melawan angin sepanjang jalan, +1 didorong angin sepanjang jalan. */
  anginSearah: number
  anginLabel: 'searah' | 'menyamping' | 'melawan'

  // ---- pembanding jujur --------------------------------------------------
  // Rute mengikuti pusat heksagon, jadi ia SELALU lebih panjang daripada garis
  // lurus — zigzag antar pusat petak, bukan karena menghindari apa pun.
  // Membandingkannya dengan garis lurus lalu menyebut selisihnya "harga
  // menghindari cuaca" adalah klaim palsu: terukur di WPP 712, dua rute 22–28%
  // lebih panjang padahal garis lurusnya tidak melewati satu pun petak buruk.
  //
  // Pembanding yang sah adalah jalur TERPENDEK DI GRID YANG SAMA tanpa biaya
  // cuaca maupun angin. Selisih terhadap itu benar-benar milik penghindaran.
  /** Panjang jalur terpendek di grid ini bila cuaca & angin diabaikan. */
  jarakNetralKm: number
  kehatian: Kehatian
  /** Petak buruk yang dilewati rute terpilih. */
  nBurukRute: number
  /** Petak buruk yang akan dilewati jalur terpendek yang mengabaikan cuaca. */
  nBurukNetral: number
}

interface Simpul {
  cell: FishingGroundCell
  kelas: KelasCuaca
  alasan: string[]
  tetangga: number[]
}

/**
 * Susun graf ketetanggaan antar sel.
 *
 * Ketetanggaan ditentukan oleh JARAK, bukan indeks heksagon. Grid dibangkitkan
 * per WPP dengan pemotongan daratan, sehingga penomorannya tidak menjamin dua
 * sel bersebelahan punya indeks berdekatan — dan sel di seberang selat bisa
 * saja berurutan nomornya. Jarak selalu benar, dan 691 sel hanya berarti 477
 * ribu perbandingan sekali di awal.
 */
function bangunGraf(
  cells: FishingGroundCell[],
  hexSizeDeg: number,
  ambang: AmbangCuaca,
  faktor: number,
  diLaut?: (lat: number, lon: number) => boolean
): Simpul[] {
  const simpul: Simpul[] = cells.map((cell) => {
    const { kelas, alasan } = kelasCuaca(cell, ambang)
    return { cell, kelas, alasan, tetangga: [] }
  })

  // Sel bertetangga bila pusatnya lebih dekat dari `faktor` × ukuran heksagon
  // DAN ruas di antaranya seluruhnya di laut.
  //
  // Untuk grid pointy-top jarak antar pusat tetangga = √3·s ≈ 1,73·s, jadi
  // 1,8 adalah ketetanggaan sebenarnya. Faktor lebih besar dipakai hanya bila
  // grid terputus — lihat RADIUS di `cariRute`.
  //
  // Syarat laut di sini SEBELUMNYA TIDAK ADA, dan itulah sebab utama rute
  // memotong pulau. `ruasDiLaut` hanya dipakai untuk jembatan antar-komponen
  // dan ruas awal/akhir, sedangkan ketetanggaan biasa lolos hanya dengan
  // jarak — sehingga dua sel laut di sisi berlawanan sebuah pulau tetap
  // dianggap bertetangga selama pusatnya berdekatan. Terukur di WPP 712:
  // 12,2 % panjang rute jatuh di darat, dengan satu lintasan 68 km melintasi
  // Madura.
  //
  // Ongkosnya kecil: uji hanya dijalankan pada pasangan yang SUDAH lolos
  // saringan jarak (±6–10 per sel, bukan 1,28 juta pasangan), dan tiap uji
  // menyampel per 4 km.
  // Sel yang PUSATNYA di darat tidak boleh jadi titik singgah.
  //
  // `ruasDiLaut` hanya menyampel bagian DALAM ruas, tidak pernah ujungnya —
  // disengaja, karena titik berangkat pengguna adalah posisi GPS di pelabuhan,
  // yang memang di darat. Akibatnya sel dengan pusat di darat tetap bisa
  // menjadi simpul perantara, dan rute berjalan dari daratan ke daratan lewat
  // beberapa sisi berturut-turut. Itulah asal lintasan 68 km melintasi Madura:
  // satu sisi paling panjang ±12 km, jadi 68 km hanya mungkin bila beberapa
  // pusat selnya sendiri ada di darat.
  //
  // Terukur, pusat sel di darat menurut `maskDarat`: 67/1.603 di WPP 712,
  // 48/1.660 di 573, 70/1.641 di 714 — penyaring laut pembuat grid memang
  // lebih longgar daripada peta darat yang dipakai rute. Di sini sel itu hanya
  // dikeluarkan dari GRAF RUTE; ia tetap tampil di peta, dan itu soal
  // terpisah.
  const diDarat = diLaut ? simpul.map((s) => !diLaut(s.cell.lat, s.cell.lon)) : null

  const batasDeg = hexSizeDeg * faktor
  for (let i = 0; i < simpul.length; i++) {
    if (diDarat?.[i]) continue
    const a = simpul[i].cell
    const kosLat = Math.cos((a.lat * Math.PI) / 180) || 1
    for (let j = i + 1; j < simpul.length; j++) {
      if (diDarat?.[j]) continue
      const b = simpul[j].cell
      const dLat = a.lat - b.lat
      if (Math.abs(dLat) > batasDeg) continue
      const dLon = (a.lon - b.lon) * kosLat
      if (dLat * dLat + dLon * dLon <= batasDeg * batasDeg && ruasDiLaut(a, b, diLaut)) {
        simpul[i].tetangga.push(j)
        simpul[j].tetangga.push(i)
      }
    }
  }

  sambungKomponen(simpul, diLaut)
  return simpul
}

/**
 * Sambungkan kantong-kantong yang tidak saling terhubung.
 *
 * KENAPA INI PERLU, DAN KENAPA BUKAN SEKADAR MELEBARKAN RADIUS
 *
 * Grid membuang sel yang daratan, terlalu dangkal, atau di luar poligon WPP.
 * Akibatnya laut yang di dunia nyata menyambung bisa terpecah di grid: selat
 * sempit, alur antar pulau, atau sekadar deretan sel yang gugur filter.
 * Terukur di WPP 712 — perairan Semarang dan Banjarmasin jatuh ke komponen
 * berbeda, dan pencarian mengembalikan "tidak ada rute" untuk pelayaran yang
 * jelas rutin ditempuh.
 *
 * Melebarkan radius secara global memang menyambung, tetapi sekaligus
 * menghubungkan SEMUA sel yang berjauhan di seluruh peta — rute jadi bisa
 * melompati petak yang seharusnya dilewati, termasuk melompati justru petak
 * bercuaca buruk yang ingin dihindari. Itu menyelesaikan gejala dengan merusak
 * yang dijaga.
 *
 * Di sini ketetanggaan normal dipertahankan rapat, dan hanya JEMBATAN
 * seperlunya yang ditambahkan: pasangan sel terdekat antar dua komponen,
 * berulang sampai semuanya menyatu. Jumlah jembatan sedikit, panjangnya
 * minimal, dan seluruh sisa graf tetap mencerminkan ketetanggaan sebenarnya.
 */
/**
 * Apakah ruas lurus antara dua titik seluruhnya di laut?
 *
 * Disampel tiap ~1 km, bukan 4 km.
 *
 * Alasan lama untuk 4 km — "pulau yang lebih sempit dari 4 km bukan penghalang
 * pelayaran yang berarti" — mencampuradukkan dua hal. Yang lolos di antara dua
 * sampel berjarak 4 km bukan hanya pulau selebar 4 km, melainkan juga TEPI
 * pulau besar dan tanjung yang menjorok: sampelnya kebetulan jatuh di air pada
 * kedua sisinya. Terukur setelah uji darat ditambahkan pada ketetanggaan,
 * masih tersisa 55 ruas menyerempet daratan di WPP 712, 38 di 573, dan 86 di
 * 714 — seluruhnya lewat jembatan antar-komponen yang panjang.
 *
 * 1 km dipilih karena peta daratnya sendiri berpetak 0,02° (±2,2 km);
 * menyampel lebih rapat dari itu tidak menambah informasi apa pun. Ongkosnya
 * tetap kecil: uji hanya berjalan pada pasangan yang sudah lolos saringan
 * jarak, dan ruas ketetanggaan panjangnya hanya ±12 km.
 */
function ruasDiLaut(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  diLaut?: (lat: number, lon: number) => boolean
): boolean {
  if (!diLaut) return true
  const km = jarakKm(a, b)
  const n = Math.max(2, Math.ceil(km / 1))
  for (let i = 1; i < n; i++) {
    const t = i / n
    if (!diLaut(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)) return false
  }
  return true
}

function sambungKomponen(simpul: Simpul[], diLaut?: (lat: number, lon: number) => boolean): void {
  const n = simpul.length
  if (!n) return

  // Union-find ringkas.
  const induk = new Int32Array(n)
  for (let i = 0; i < n; i++) induk[i] = i
  const cari = (x: number): number => {
    while (induk[x] !== x) { induk[x] = induk[induk[x]]; x = induk[x] }
    return x
  }
  const satukan = (a: number, b: number): boolean => {
    const ra = cari(a), rb = cari(b)
    if (ra === rb) return false
    induk[rb] = ra
    return true
  }
  for (let i = 0; i < n; i++) for (const j of simpul[i].tetangga) satukan(i, j)

  for (;;) {
    const kelompok = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const r = cari(i)
      const arr = kelompok.get(r)
      if (arr) arr.push(i); else kelompok.set(r, [i])
    }
    if (kelompok.size <= 1) return

    // Ambil komponen TERKECIL dan sambungkan ke sel terdekat di luar dirinya.
    // Selalu yang terkecil supaya jumlah iterasi turun secepat mungkin dan
    // pulau-pulau kecil tidak dibiarkan menggantung.
    let kecil: number[] = []
    for (const arr of kelompok.values()) {
      if (!kecil.length || arr.length < kecil.length) kecil = arr
    }
    const anggota = new Set(kecil)

    // Pasangan terdekat yang ruasnya TIDAK memotong daratan. Sebelumnya cukup
    // "terdekat" saja, dan itulah yang membuat jembatan antar kantong bisa
    // memotong pulau: dua petak di sisi berlawanan Jawa memang bertetangga
    // menurut jarak lurus.
    const calon: { i: number; j: number; d: number }[] = []
    for (const i of kecil) {
      for (let j = 0; j < n; j++) {
        if (anggota.has(j)) continue
        calon.push({ i, j, d: jarakKm(simpul[i].cell, simpul[j].cell) })
      }
    }
    calon.sort((x, y) => x.d - y.d)
    let bi = -1, bj = -1
    // Hanya 400 kandidat terdekat yang diuji: uji laut/darat menyampel per 4 km
    // dan menguji seluruh pasangan pada grid 1.600 sel akan lebih mahal
    // daripada pencarian rutenya sendiri.
    for (const c of calon.slice(0, 400)) {
      if (ruasDiLaut(simpul[c.i].cell, simpul[c.j].cell, diLaut)) { bi = c.i; bj = c.j; break }
    }
    // Tidak ada jembatan yang sah — kantong ini memang terpisah daratan.
    // Dibiarkan terpisah; A* akan gagal untuk tujuan di dalamnya, dan itu
    // jawaban yang benar: memang tidak ada jalur laut di grid ini.
    if (bi < 0 || bj < 0) {
      for (const i of kecil) induk[cari(i)] = cari(i)
      const sisa = new Set(kecil)
      let lain = -1
      for (let i = 0; i < n; i++) if (!sisa.has(i)) { lain = i; break }
      if (lain < 0) return
      satukan(lain, kecil[0])
      continue
    }
    simpul[bi].tetangga.push(bj)
    simpul[bj].tetangga.push(bi)
    satukan(bi, bj)
  }
}

/**
 * Sejauh mana dari posisi kapal daratan masih boleh muncul di ruas pertama.
 *
 * Cukup untuk kolam pelabuhan, muara, beting, dan bibir pantai — Tanjung Emas,
 * Muara Baru, Perak, Pekalongan, dan Rembang semuanya tertangani — tetapi jauh
 * lebih pendek daripada lebar pulau yang relevan (Madura ±30 km, Jawa ±100 km
 * pada lintasan utara–selatan), sehingga ruas yang benar-benar MENYEBERANGI
 * pulau tetap ditolak.
 */
const ZONA_PANTAI_KM = 20

/**
 * Bolehkah ruas dari posisi kapal ke simpul grid ditempuh?
 *
 * BEDANYA DENGAN `ruasDiLaut`, DAN KENAPA HARUS BEDA
 *
 * `ruasDiLaut` menuntut SELURUH ruas di laut. Untuk ruas antar-petak itu
 * benar. Untuk ruas pertama itu mustahil: pengguna berangkat dari pelabuhan,
 * dan pelabuhan ada di darat. Terukur pada posisi nyata di pantura — Pekalongan
 * dan Rembang terbaca di darat oleh peta 0,02°, sehingga SETIAP permintaan rute
 * dari sana dijawab "tidak ada jalur laut", berapa pun tujuannya.
 *
 * Yang benar-benar perlu dicegah bukan "berangkat dari darat", melainkan ruas
 * yang MENYEBERANGI daratan — misalnya dari Jakarta langsung ke petak di
 * selatan Jawa, melompati pulaunya. Keduanya dibedakan menurut DI MANA
 * daratnya muncul: di dalam `ZONA_PANTAI_KM` pertama boleh, di luar itu tidak.
 *
 * Aturan yang lebih ketat — "darat hanya boleh sebagai awalan, dan begitu
 * menyentuh laut tidak boleh kembali" — sempat dipakai dan ternyata keliru.
 * Bentuk yang sesungguhnya di pelabuhan bukan darat-lalu-laut, melainkan
 * laut-sebentar-darat-lalu-laut: dari Tanjung Perak ruasnya berangkat di air
 * kolam pelabuhan, menyerempet ±2 km beting yang pada peta 2,2 km terbaca
 * darat, lalu bersih sampai tujuan. Aturan itu menolaknya, dan seluruh rute
 * dari Surabaya gagal.
 */
function ruasKeluarPelabuhan(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  diLaut?: (lat: number, lon: number) => boolean
): boolean {
  if (!diLaut) return true
  const km = jarakKm(a, b)
  const n = Math.max(2, Math.ceil(km / 1))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (diLaut(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)) continue
    // Titik ini di darat — hanya dimaafkan bila masih di zona pantai.
    if (km * t > ZONA_PANTAI_KM) return false
  }
  // Ujungnya harus di laut: simpul grid tujuan ruas ini adalah petak tempat
  // pelayaran sesungguhnya dimulai.
  return diLaut(b.lat, b.lon)
}

/**
 * Simpul grid TERDEKAT YANG BISA DICAPAI dari posisi kapal.
 *
 * Sekadar "terdekat" tidak cukup: simpul terdekat secara garis lurus bisa
 * berada di seberang tanjung, sehingga ruas pertamanya menyeberangi daratan dan
 * seluruh rute ditolak — padahal simpul kedua atau ketiga terdekat dapat
 * dicapai tanpa masalah. Terukur di Surabaya (Perak): posisinya terbaca di
 * laut, tetapi permintaan rutenya tetap gagal karena sebab ini.
 *
 * Kandidat diurutkan menurut jarak dan diambil yang PERTAMA lolos, jadi rute
 * tetap berangkat dari petak sedekat mungkin.
 */
function terdekatTercapai(
  simpul: Simpul[],
  titik: { lat: number; lon: number },
  diLaut?: (lat: number, lon: number) => boolean
): number {
  const calon: { i: number; km: number }[] = []
  for (let i = 0; i < simpul.length; i++) {
    if (!simpul[i].tetangga.length) continue
    calon.push({ i, km: jarakKm(titik, simpul[i].cell) })
  }
  calon.sort((x, y) => x.km - y.km)
  // 60 kandidat terdekat sudah jauh melampaui lebar teluk mana pun; bila tidak
  // satu pun lolos, memang tidak ada jalan keluar ke laut dari titik itu.
  for (const c of calon.slice(0, 60)) {
    if (ruasKeluarPelabuhan(titik, simpul[c.i].cell, diLaut)) return c.i
  }
  return calon.length ? calon[0].i : -1
}

/**
 * Simpul grid terdekat ke sebuah titik — hanya yang PUNYA TETANGGA.
 *
 * Sel yang pusatnya di darat sengaja tidak diberi tetangga di `bangunGraf`,
 * sehingga ia berdiri sendiri di graf. Tanpa syarat `tetangga.length`, sel
 * seperti itu tetap terpilih sebagai titik awal/tujuan, A* langsung buntu, dan
 * seluruh permintaan dijawab "tidak ada jalur laut" — padahal yang tidak
 * terjangkau hanya satu petak, bukan wilayahnya.
 *
 * Terukur: 12 dari 359 permintaan di WPP 712 dan 6 dari 359 di WPP 714 gagal
 * karena ini, dan SELURUHNYA tujuan yang pusatnya di darat.
 */
function terdekat(simpul: Simpul[], titik: { lat: number; lon: number }): number {
  let best = -1
  let bestKm = Infinity
  for (let i = 0; i < simpul.length; i++) {
    if (!simpul[i].tetangga.length) continue
    const d = jarakKm(titik, simpul[i].cell)
    if (d < bestKm) { bestKm = d; best = i }
  }
  return best
}

/**
 * A* dari `mulai` ke `tujuan`. Mengembalikan null bila tujuan tak terjangkau.
 *
 * Heuristiknya jarak haversine ke tujuan dikali biaya termurah (1). Karena
 * tidak pernah melebihi biaya sebenarnya, ia admissible — rute yang ditemukan
 * benar-benar termurah, bukan sekadar yang pertama ketemu.
 */
function aStar(
  simpul: Simpul[],
  mulai: number,
  tujuan: number,
  zonaAngin?: ZonaAngin[],
  /** false = abaikan cuaca & angin; dipakai untuk menghitung pembanding netral. */
  pakaiBiaya = true,
  kehatian: Kehatian = 'normal'
): { asal: Int32Array; g: Float64Array } | null {
  const n = simpul.length
  const g = new Float64Array(n).fill(Infinity)
  const f = new Float64Array(n).fill(Infinity)
  const asal = new Int32Array(n).fill(-1)
  const selesai = new Uint8Array(n)

  const tujuanCell = simpul[tujuan].cell
  g[mulai] = 0
  f[mulai] = jarakKm(simpul[mulai].cell, tujuanCell)

  // Antrian sederhana: n ≈ 700, jadi pemindaian linear per langkah (~490 ribu
  // operasi total) lebih murah daripada memelihara heap — dan jauh lebih mudah
  // dibaca. Bila grid halus 20 ribu sel kelak dipakai di sini, ganti ke heap.
  for (;;) {
    let kini = -1
    let terkecil = Infinity
    for (let i = 0; i < n; i++) {
      if (!selesai[i] && f[i] < terkecil) { terkecil = f[i]; kini = i }
    }
    if (kini < 0) break
    if (kini === tujuan) break
    selesai[kini] = 1

    for (const j of simpul[kini].tetangga) {
      if (selesai[j]) continue
      const a = simpul[kini].cell
      const b = simpul[j].cell
      const d = jarakKm(a, b)
      const cobaG = pakaiBiaya
        ? g[kini] +
          d * BIAYA[kehatian][simpul[j].kelas] *
            pengaliAngin(bearingDeg(a, b), zonaAngin, a.lat, a.lon)
        : g[kini] + d
      if (cobaG < g[j]) {
        g[j] = cobaG
        asal[j] = kini
        f[j] = cobaG + jarakKm(simpul[j].cell, tujuanCell)
      }
    }
  }

  if (mulai === tujuan) return { asal, g }
  if (asal[tujuan] < 0) return null
  return { asal, g }
}

export interface ZonaAngin {
  lat: number
  lon: number
  windKn: number
  /** Arah angin DATANG, derajat dari utara — konvensi Open-Meteo. */
  windDirDeg: number
}

/**
 * Uji laut/darat dari GRID ITU SENDIRI, untuk dipakai `OpsiRute.diLaut`.
 *
 * Klien tidak punya batimetri — sampler laut/darat hidup di sisi server. Tetapi
 * selnya sendiri sudah menjadi buktinya: sel hanya dibangkitkan di laut, di
 * dalam poligon WPP. Jadi "ada sel di dekat titik ini" setara dengan "titik ini
 * laut yang tercakup grid".
 *
 * Dua sifat yang menguntungkan sekaligus:
 *   • ruas yang memotong pulau tertolak — tidak ada sel di atas daratan;
 *   • ruas yang keluar dari cakupan grid juga tertolak — dan itu memang benar,
 *     karena di luar grid tidak ada yang menilai cuacanya.
 *
 * Dibangun sebagai hash kisi supaya pencariannya O(1): pemeriksaan ruas
 * menyampel ratusan titik, dan memindai 1.600 sel per sampel akan lebih mahal
 * daripada pencarian rutenya sendiri.
 */
export function buatUjiLaut(
  cells: FishingGroundCell[],
  hexSizeDeg: number
): (lat: number, lon: number) => boolean {
  const sel = Math.max(hexSizeDeg, 0.01)
  const kunci = (a: number, o: number) => `${Math.round(a / sel)}:${Math.round(o / sel)}`
  const isi = new Set<string>()
  for (const c of cells) isi.add(kunci(c.lat, c.lon))
  return (lat, lon) => {
    const ia = Math.round(lat / sel)
    const io = Math.round(lon / sel)
    // Tetangga ikut diperiksa: pusat sel berjarak sampai satu kisi dari titik
    // mana pun di dalamnya, jadi memeriksa satu kotak saja akan menolak titik
    // yang sebenarnya berada di dalam petak tetangganya.
    for (let da = -1; da <= 1; da++) {
      for (let dobj = -1; dobj <= 1; dobj++) {
        if (isi.has(`${ia + da}:${io + dobj}`)) return true
      }
    }
    return false
  }
}

export interface OpsiRute {
  hexSizeDeg: number
  /** Kecepatan jelajah kapal, knot. Bawaan 8 kn — kapal nelayan 10–30 GT. */
  kecepatanKn?: number
  ambang?: AmbangCuaca
  /** Zona angin untuk membebani ruas yang melawan angin. */
  zonaAngin?: ZonaAngin[]
  /** Seberapa keras menghindari petak buruk. Bawaan 'normal'. */
  kehatian?: Kehatian
  /** Uji laut/darat. Bila diberikan, ruas yang memotong daratan ditolak.
   *
   *  Tanpa ini rute bisa menggambar garis lurus menembus pulau: dua tempat
   *  penyambungannya tidak memeriksa apa pun kecuali jarak — jembatan antar
   *  kantong grid, dan ruas ujung dari posisi kapal / ke tujuan menuju simpul
   *  grid terdekat. Terukur pada keluhan nyata: rute Jakarta ke selatan NTT
   *  melintasi daratan Jawa. */
  diLaut?: (lat: number, lon: number) => boolean
}

/**
 * Pengali biaya sebuah ruas menurut arah angin terhadap arah laju.
 *
 * `windDirDeg` adalah arah angin DATANG (konvensi Open-Meteo), jadi angin
 * BERTIUP menuju windDirDeg + 180. Kapal yang haluannya searah tiupan itu
 * didorong; yang berlawanan menerjang.
 *
 * Rentangnya 1,0 (angin buritan penuh) sampai 1 + amplitudo (angin haluan
 * penuh), dengan amplitudo tumbuh menurut kecepatan angin: pada angin 5 knot
 * arah nyaris tidak berarti, pada 20 knot ia menentukan. Tanpa penskalaan itu,
 * rute akan memutar jauh hanya untuk menghindari angin sepoi.
 *
 * Ini BUKAN model hidrodinamika. Ia hanya menyatakan preferensi yang memang
 * dipakai nakhoda — kalau dua jalur sama panjang, ambil yang tidak melawan
 * angin — dan besarnya sengaja kecil dibanding pengali cuaca buruk, supaya
 * kenyamanan tidak pernah menang atas keselamatan.
 */
function terdekatZona(zona: ZonaAngin[], lat: number, lon: number): ZonaAngin {
  let dekat = zona[0]
  let bd = Infinity
  for (const z of zona) {
    const d = (z.lat - lat) ** 2 + (z.lon - lon) ** 2
    if (d < bd) { bd = d; dekat = z }
  }
  return dekat
}

/** +1 bila haluan searah tiupan angin (didorong), −1 bila melawan, 0 menyamping. */
function komponenSearah(
  bearing: number,
  zona: ZonaAngin[] | undefined,
  lat: number,
  lon: number
): number {
  if (!zona || !zona.length) return 0
  const dekat = terdekatZona(zona, lat, lon)
  const arahTiup = (dekat.windDirDeg + 180) % 360
  const beda = ((bearing - arahTiup + 540) % 360) - 180
  return Math.cos((beda * Math.PI) / 180)
}

function pengaliAngin(
  bearing: number,
  zona: ZonaAngin[] | undefined,
  lat: number,
  lon: number
): number {
  if (!zona || !zona.length) return 1
  const kn = terdekatZona(zona, lat, lon).windKn ?? 0
  if (!isFinite(kn) || kn <= 0) return 1
  const amplitudo = Math.min(0.6, kn / 33)
  return 1 + (amplitudo * (1 - komponenSearah(bearing, zona, lat, lon))) / 2
}

/**
 * Cari rute dari `dari` ke `ke` melewati pusat-pusat heksagon, menghindari
 * cuaca buruk. Mengembalikan null bila grid kosong.
 */
export function cariRute(
  cells: FishingGroundCell[],
  dari: { lat: number; lon: number },
  ke: { lat: number; lon: number },
  opsi: OpsiRute
): HasilRute | null {
  if (!cells.length) return null
  const ambang = opsi.ambang ?? AMBANG_BAWAAN
  const kecepatanKn = opsi.kecepatanKn ?? 8
  const catatan: string[] = []

  // 1,8 × ukuran heksagon adalah ketetanggaan yang sebenarnya (jarak antar
  // pusat tetangga = √3·s ≈ 1,73·s). Kantong yang tetap terpisah setelah itu
  // dijembatani di dalam `bangunGraf`, jadi graf dijamin tersambung dan A*
  // tidak akan gagal karena lubang grid.
  const simpul = bangunGraf(cells, opsi.hexSizeDeg, ambang, 1.8, opsi.diLaut)
  const mulai = terdekatTercapai(simpul, dari, opsi.diLaut)
  const tujuan = terdekat(simpul, ke)
  if (mulai < 0 || tujuan < 0) return null

  const kehatian = opsi.kehatian ?? 'normal'
  const hasil = aStar(simpul, mulai, tujuan, opsi.zonaAngin, true, kehatian)
  if (!hasil) return null
  const asal = hasil.asal

  // Pembanding netral: jalur terpendek di grid yang sama, cuaca & angin
  // diabaikan. Inilah yang akan ditempuh kapal yang tidak peduli cuaca, dan
  // satu-satunya pembanding yang membuat "berapa harga menghindar" bermakna.
  const netral = aStar(simpul, mulai, tujuan, undefined, false)
  let jarakNetralKm = 0
  let nBurukNetral = 0
  if (netral) {
    const jalur: number[] = []
    for (let i = tujuan; i >= 0; i = netral.asal[i]) {
      jalur.push(i)
      if (i === mulai) break
    }
    jalur.reverse()
    for (let i = 1; i < jalur.length; i++) {
      jarakNetralKm += jarakKm(simpul[jalur[i - 1]].cell, simpul[jalur[i]].cell)
    }
    // Ruas ujung ikut dihitung — sama seperti pada rute terpilih. Tanpa ini
    // pembandingnya timpang dan selisihnya selalu memuat panjang kedua ruas
    // itu, yang tidak ada hubungannya dengan menghindari cuaca. Gejalanya
    // khas: selisih yang sama persis untuk rute 38 km dan rute 751 km.
    jarakNetralKm += jarakKm(dari, simpul[jalur[0]].cell)
    jarakNetralKm += jarakKm(simpul[jalur[jalur.length - 1]].cell, ke)
    nBurukNetral = jalur.filter((i) => simpul[i].kelas !== 'aman').length
  }

  // ---- ruas ujung: dari posisi kapal ke grid, dan dari grid ke tujuan ------
  //
  // Keduanya garis lurus — grid tidak menjangkau titik sembarang. Selama ruas
  // itu pendek dan di laut, itu wajar. Yang TIDAK wajar adalah menggambarnya
  // ketika ia menyeberangi daratan, dan itulah yang terjadi bila tujuannya
  // berada di WPP lain: simpul grid terdekat ada di tepi WPP ini, lalu ruas
  // penutupnya melompati pulau. Terukur pada keluhan nyata — rute dari Jakarta
  // ke selatan NTT melintasi daratan Jawa.
  //
  // Rute semacam itu tidak diperbaiki, melainkan DITOLAK. Menggambar jalur
  // yang mustahil ditempuh lebih buruk daripada tidak menggambar apa pun:
  // yang pertama terlihat seperti jawaban.
  //
  // KECUALI satu hal: bila TITIK TUJUANNYA SENDIRI di darat.
  //
  // Grid memuat ±4 % petak yang pusatnya jatuh di daratan — penyaring laut
  // pembuatnya lebih longgar daripada peta darat yang dipakai di sini. Petak
  // itu tetap tampil berwarna di peta, jadi pengguna bisa dan akan mengekliknya.
  // Menolak seluruh rutenya menjawab "tidak ada jalur laut ke lokasi itu",
  // yang salah dua kali: jalurnya ada, dan yang bermasalah hanya ujungnya.
  //
  // Jadi rutenya digambar sampai petak laut terdekat, dan ruas penutup ke
  // pusat petak darat itu tidak dipaksakan — dengan sebabnya ditulis di
  // catatan, bukan didiamkan.
  const tujuanDiDarat = opsi.diLaut ? !opsi.diLaut(ke.lat, ke.lon) : false
  const kmKeGrid = jarakKm(dari, simpul[mulai].cell)
  const kmDariGrid = jarakKm(ke, simpul[tujuan].cell)
  // Ruas pertama dinilai dengan `ruasKeluarPelabuhan`, bukan `ruasDiLaut`:
  // berangkat dari darat itu normal, menyeberangi daratan yang tidak.
  if (!ruasKeluarPelabuhan(dari, simpul[mulai].cell, opsi.diLaut)) {
    return null
  }
  if (opsi.diLaut && !opsi.diLaut(dari.lat, dari.lon)) {
    catatan.push(
      `Posisi awal terbaca di daratan; ruas pertama sepanjang ` +
        `${kmKeGrid.toFixed(1)} km menuju petak laut terdekat belum dinilai cuacanya.`
    )
  }
  if (tujuanDiDarat) {
    catatan.push(
      `Pusat petak tujuan jatuh di daratan; rute berakhir di petak laut ` +
        `terdekat, ${kmDariGrid.toFixed(1)} km sebelumnya.`
    )
  } else if (!ruasDiLaut(simpul[tujuan].cell, ke, opsi.diLaut)) {
    return null
  }
  if (kmKeGrid > 25) {
    catatan.push(
      `Posisi awal ${kmKeGrid.toFixed(0)} km dari petak terdekat; ruas pertama belum dinilai cuacanya.`
    )
  }
  if (kmDariGrid > 25) {
    // Tujuan di luar cakupan grid WPP ini. Rutenya tetap digambar karena
    // ruasnya sudah dipastikan di laut, tetapi bagian itu tidak dinilai
    // cuacanya — dan itu harus disebut, bukan disembunyikan.
    catatan.push(
      `Tujuan ${kmDariGrid.toFixed(0)} km dari petak terdekat — di luar cakupan grid WPP ini; ` +
        `ruas penutup belum dinilai cuacanya.`
    )
  }

  // ---- rangkai kembali ----------------------------------------------------
  const urut: number[] = []
  for (let i = tujuan; i >= 0; i = asal[i]) {
    urut.push(i)
    if (i === mulai) break
  }
  urut.reverse()

  const titik: TitikRute[] = [
    { lat: dari.lat, lon: dari.lon, kelas: 'aman', alasan: ['posisi kapal'] },
    ...urut.map((i) => ({
      lat: simpul[i].cell.lat,
      lon: simpul[i].cell.lon,
      cellId: simpul[i].cell.id,
      kelas: simpul[i].kelas,
      alasan: simpul[i].alasan,
    })),
    // Ruas penutup ke titik tujuan hanya digambar bila titik itu di laut.
    // Bila pusat petaknya di daratan, garisnya akan berakhir di tengah pulau —
    // gambar yang lebih menyesatkan daripada rute yang berhenti di petak laut
    // terdekat, apalagi catatannya sudah menyebut selisihnya.
    ...(tujuanDiDarat
      ? []
      : [{ lat: ke.lat, lon: ke.lon, kelas: 'aman' as const, alasan: ['area tujuan'] }]),
  ]

  // Panjang total dan keberpihakan angin dihitung di lintasan yang sama.
  // Rata-ratanya DIBOBOT PANJANG RUAS: ruas 60 km yang melawan angin tidak
  // boleh dianggap setara dengan ruas 5 km yang searah.
  let total = 0
  let anginTertimbang = 0
  for (let i = 1; i < titik.length; i++) {
    const a = titik[i - 1]
    const b = titik[i]
    const d = jarakKm(a, b)
    total += d
    if (opsi.zonaAngin?.length) {
      anginTertimbang += komponenSearah(bearingDeg(a, b), opsi.zonaAngin, a.lat, a.lon) * d
    }
  }
  const anginSearah = total > 0 ? anginTertimbang / total : 0
  const anginLabel: HasilRute['anginLabel'] =
    anginSearah > 0.35 ? 'searah' : anginSearah < -0.35 ? 'melawan' : 'menyamping'

  const kelasDilalui = urut.map((i) => simpul[i].kelas)
  const kelasTerburuk: KelasCuaca = kelasDilalui.includes('bahaya')
    ? 'bahaya'
    : kelasDilalui.includes('waspada')
      ? 'waspada'
      : 'aman'

  const nBuruk = simpul.filter((s) => s.kelas !== 'aman').length
  if (kelasTerburuk === 'bahaya') {
    catatan.push('Cuaca buruk menutup seluruh jalur; rute terpaksa melintasinya.')
  }

  const lurus = jarakKm(dari, ke)
  return {
    titik,
    jarakKm: total,
    jarakLurusKm: lurus,
    bearingAwal: bearingDeg(dari, ke),
    jamTempuh: total / (kecepatanKn * 1.852),
    kelasTerburuk,
    nSelDihindari: nBuruk,
    melintasiBahaya: kelasTerburuk === 'bahaya',
    catatan,
    anginSearah,
    anginLabel,
    jarakNetralKm,
    kehatian,
    nBurukRute: kelasDilalui.filter((k) => k !== 'aman').length,
    nBurukNetral,
  }
}
