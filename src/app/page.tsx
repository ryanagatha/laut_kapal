'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PetaKapten, type Petak } from '@/components/PetaKapten'
import { PilihWpp, type Wilayah } from '@/components/PilihWpp'
import { PilihMode, type Mode } from '@/components/PilihMode'
import { LembarValidasi, type IsiValidasi } from '@/components/LembarValidasi'
import { Merek } from '@/components/Merek'
import { PanelIklim, type Iklim } from '@/components/PanelIklim'
import { PanelCatat } from '@/components/PanelCatat'
import { PeringatanPosisi, type Posisi } from '@/components/PeringatanPosisi'
import { LABEL_KUADRAN, WARNA_KUADRAN } from '@/lib/warna'
import { bearingDeg, jamTempuh, jarakKm, koordinat, lamaManusiawi, mataAngin } from '@/lib/geo'
import { antrekan, idPerangkat, jumlahAntre, kirimAntrean } from '@/lib/antrean'

type Target = 'kecil' | 'besar'

/** Keterangan satu petak — hanya yang mengubah keputusan berlayar. */
type Info = {
  id: string
  level: string
  lat: number
  lon: number
  skor: number
  kelas: string
  ombakM: number | null
  ombakLabel: string | null
  ombakBesar: boolean | null
  anginKn: number | null
  anginArahDeg: number | null
  anginMataAngin: string | null
  cuaca: string | null
  risiko: string | null
  risikoSebab: string | null
  saran: string | null
}

type InfoWpp = {
  kode: string
  nama: string
  targetLabel: string
  acuan: { lat: number; lon: number } | null
}

type HasilRute = {
  titik: { lat: number; lon: number; kelas: string }[]
  jarakKm: number
  jamTempuh: number
  nBurukRute: number
  jarakNetralKm: number
  anginLabel: string
}

const WARNA_RISIKO: Record<string, string> = {
  aman: '#16a34a',
  waspada: '#eab308',
  bahaya: '#ef4444',
}

const K_MODE = 'kapten.mode.v1'
const K_WPP = 'kapten.wpp.v1'
const K_TARGET = 'kapten.target.v1'

type Langkah = 'wpp' | 'mode' | 'peta'

export default function Aplikasi() {
  const [siap, setSiap] = useState(false)
  const [langkah, setLangkah] = useState<Langkah>('wpp')
  const [mode, setMode] = useState<Mode>('rekomendasi')
  const [wpp, setWpp] = useState<string | null>(null)
  const [target, setTarget] = useState<Target>('kecil')

  const [daftar, setDaftar] = useState<Wilayah[]>([])
  const [daftarMemuat, setDaftarMemuat] = useState(true)
  const [daftarGalat, setDaftarGalat] = useState<string | null>(null)

  const [infoWpp, setInfoWpp] = useState<InfoWpp | null>(null)
  const [petak, setPetak] = useState<Petak[]>([])
  const [ukuran, setUkuran] = useState(0.1)
  const [halus, setHalus] = useState<Petak[]>([])
  const [ukuranHalus, setUkuranHalus] = useState(0.0079)
  const [indukHalus, setIndukHalus] = useState<string | null>(null)
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [adaAngka, setAdaAngka] = useState(true)
  const [iklim, setIklim] = useState<Iklim | null>(null)
  const [iklimGalat, setIklimGalat] = useState<string | null>(null)

  const [pilih, setPilih] = useState<Info | null>(null)
  const [rute, setRute] = useState<HasilRute | null>(null)
  const [ruteSibuk, setRuteSibuk] = useState(false)
  const [kehatian, setKehatian] = useState<'normal' | 'ketat'>('normal')

  const [posisi, setPosisi] = useState<{ lat: number; lon: number } | null>(null)
  const [arah, setArah] = useState<number | null>(null)
  const [gpsGalat, setGpsGalat] = useState<string | null>(null)
  const [ikuti, setIkuti] = useState(false)

  const [menilai, setMenilai] = useState<Info | null>(null)
  /**
   * Mode yang berlaku SAAT lembar penilaian dibuka, dipotret di sini.
   *
   * Membaca `mode` pada saat kirim membuat label catatan bergantung pada apa
   * yang kebetulan aktif beberapa detik kemudian. Membersihkan lembar saat
   * ganti mode menutup satu jalannya, tetapi potret ini menutup seluruh
   * kelasnya — label tidak bisa lagi berubah setelah kapten mulai mengisi.
   */
  const [modeNilai, setModeNilai] = useState<Mode>('rekomendasi')
  /**
   * Apakah catatan manual yang sedang diisi berasal dari pin di peta.
   *
   * Dipotret saat pencatatan dimulai, bukan dibaca dari `pin` saat kirim:
   * lembar penilaian tidak menutupi seluruh peta, jadi kapten masih bisa
   * menggeser pin sesudahnya — dan koordinat yang tercatat akan berbeda dari
   * penanda yang menyertainya.
   */
  const [catatDariPin, setCatatDariPin] = useState(false)
  const [simpanSibuk, setSimpanSibuk] = useState(false)
  const [pesan, setPesan] = useState<string | null>(null)
  const [antre, setAntre] = useState(0)
  /** Titik yang ditandai dengan mengetuk peta di mode Pencatatan Manual. */
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null)
  const [akurasiM, setAkurasiM] = useState<number | null>(null)
  const [catatan, setCatatan] = useState<{ lat: number; lon: number; hasil: string }[]>([])
  /** Peringatan posisi yang sedang ditampilkan sebelum menilai petak. */
  const [peringatan, setPeringatan] = useState<Posisi | null>(null)
  /** Hasil pemeriksaan posisi yang ikut tercatat ke basis data. */
  const [posisiCocok, setPosisiCocok] = useState<boolean | null>(null)
  const [jarakKePetakKm, setJarakKePetakKm] = useState<number | null>(null)

  // ---- preferensi & tautan langsung ---------------------------------------
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    let w: string | null = null
    let m: string | null = null
    try {
      w = q.get('wpp') ?? localStorage.getItem(K_WPP)
      const t = q.get('target') ?? localStorage.getItem(K_TARGET)
      if (t === 'kecil' || t === 'besar') setTarget(t)
      m = q.get('mode') ?? localStorage.getItem(K_MODE)
      if (m === 'rekomendasi' || m === 'eksplorasi') setMode(m)
    } catch {
      /* localStorage ditolak di mode privat — pakai bawaan */
    }
    if (w) setWpp(w)
    // Langsung ke peta hanya bila KEDUANYA sudah diketahui. Melompat ke peta
    // dengan wilayah tersimpan tetapi mode belum pernah dipilih membuat
    // kapten baru mendarat di layar yang tidak pernah ia minta.
    if (w && (m === 'rekomendasi' || m === 'eksplorasi')) setLangkah('peta')
    else if (w) setLangkah('mode')
    setAntre(jumlahAntre())
    setSiap(true)
  }, [])

  const simpan = (k: string, v: string) => {
    try { localStorage.setItem(k, v) } catch { /* abaikan */ }
  }

  /**
   * Bersihkan seluruh keadaan interaksi.
   *
   * Dipanggil saat berpindah mode. Sebelumnya hanya `pin` yang dibuang, dan
   * itu meninggalkan dua cacat:
   *
   *  - petak yang masih terpilih membuat panel bawah tetap menampilkan
   *    "Cuaca petak", sehingga Pencatatan Manual tidak pernah muncul sampai
   *    kapten menutup petaknya sendiri — padahal ia baru saja memilih mode
   *    itu;
   *  - lembar penilaian yang sedang terbuka tetap terbuka, sementara `mode`
   *    dibaca pada saat KIRIM. Validasi rekomendasi akan tersimpan berlabel
   *    `manual` hanya karena sakelar mode tersentuh sebelum tombol kirim.
   */
  const bersihkanInteraksi = useCallback(() => {
    setPilih(null)
    setMenilai(null)
    setPeringatan(null)
    setPin(null)
    setRute(null)
    setHalus([])
    setIndukHalus(null)
    setPosisiCocok(null)
    setJarakKePetakKm(null)
  }, [])

  useEffect(() => {
    const coba = async () => {
      if (!jumlahAntre()) return
      const r = await kirimAntrean()
      setAntre(r.sisa)
      if (r.terkirim > 0) setPesan(`${r.terkirim} penilaian tersimpan ke pusat.`)
    }
    coba()
    window.addEventListener('online', coba)
    return () => window.removeEventListener('online', coba)
  }, [])

  useEffect(() => {
    fetch('/api/wpp')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Gagal memuat wilayah.')
        return j
      })
      .then((j) => setDaftar(j.wpp ?? []))
      .catch((e) => setDaftarGalat(e instanceof Error ? e.message : String(e)))
      .finally(() => setDaftarMemuat(false))
  }, [])

  // ---- muatan peta ---------------------------------------------------------
  useEffect(() => {
    if (langkah !== 'peta' || !wpp) return
    setMemuat(true)
    setGalat(null)
    setPilih(null)
    setHalus([])
    setIndukHalus(null)
    setRute(null)
    Promise.all([
      fetch(`/api/petak?wpp=${wpp}&target=${target}`).then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Gagal memuat petak.')
        return j
      }),
      fetch(`/api/area?wpp=${wpp}&target=${target}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, a]) => {
        setPetak(p.petak ?? [])
        setUkuran(p.sizeDeg ?? 0.1)
        if (a?.info) setInfoWpp(a.info)
      })
      .catch((e) => setGalat(e instanceof Error ? e.message : String(e)))
      .finally(() => setMemuat(false))

  }, [langkah, wpp, target])

  // ---- ringkasan cuaca, mengikuti petak terpilih ---------------------------
  //
  // Efek TERPISAH dari muatan peta, dengan dua alasan. Pertama, ia memanggil
  // Open-Meteo yang bisa lambat atau mati — digabung ke muatan peta, heksagon
  // ikut tertahan menunggu panel pojok. Kedua, ia harus ditarik ulang setiap
  // kali petak lain dipilih, sementara petaknya sendiri tidak.
  useEffect(() => {
    if (langkah !== 'peta' || !wpp) return
    setIklim(null)
    setIklimGalat(null)
    const q = new URLSearchParams({ wpp, target })
    // Cuaca diukur DI PETAK YANG DIPILIH. WPP 712 membentang lebih dari
    // 1.000 km; angin di ujung baratnya tidak memberi tahu apa pun tentang
    // ujung timurnya, dan kapten yang menuju satu petak butuh cuaca petak itu.
    if (pilih) {
      q.set('lat', String(pilih.lat))
      q.set('lon', String(pilih.lon))
    }
    fetch(`/api/iklim?${q}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Ringkasan cuaca tidak tersedia.')
        return j as Iklim
      })
      .then(setIklim)
      .catch((e) => setIklimGalat(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langkah, wpp, target, pilih?.id])

  // ---- GPS -----------------------------------------------------------------
  useEffect(() => {
    if (langkah !== 'peta') return
    if (!('geolocation' in navigator)) {
      setGpsGalat('Perangkat tidak punya GPS.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosisi({ lat: p.coords.latitude, lon: p.coords.longitude })
        setAkurasiM(Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null)
        // `heading` hanya terisi saat perangkat bergerak; saat diam nilainya
        // NaN dan panah akan berputar liar kalau tetap dipakai.
        if (p.coords.heading != null && !Number.isNaN(p.coords.heading)) setArah(p.coords.heading)
        setGpsGalat(null)
      },
      (e) =>
        setGpsGalat(
          e.code === e.PERMISSION_DENIED
            ? 'Izin lokasi ditolak — jarak dihitung dari titik acuan wilayah.'
            : 'Posisi belum terbaca.',
        ),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [langkah])

  const pangkal = posisi ?? infoWpp?.acuan ?? null
  const dariKapal = posisi != null

  const bataskan = useMemo(() => {
    if (!petak.length) return null
    const lats = petak.map((p) => p.lat)
    const lons = petak.map((p) => p.lon)
    return [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ] as [[number, number], [number, number]]
  }, [petak])

  const fokus = useMemo(() => {
    if (pilih) return { lat: pilih.lat, lon: pilih.lon, zoom: pilih.level === 'fine' ? 10.5 : 8.6 }
    return bataskan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilih?.id, bataskan])

  /**
   * Tarik keterangan satu petak — satu-satunya isi panel bawah.
   *
   * `cell=` dikirim supaya yang dibacakan adalah petak yang BENAR-BENAR
   * diketuk. Tanpa itu endpoint menebak dari koordinat dan mendahulukan
   * petak 2 km, sehingga mengetuk heksagon besar menampilkan keterangan
   * petak kecil di dalamnya.
   */
  const bacaPetak = useCallback(
    async (p: Petak) => {
      if (!wpp) return
      setRute(null)
      try {
        const r = await fetch(
          `/api/titik?wpp=${wpp}&target=${target}&lat=${p.lat}&lon=${p.lon}` +
            `&cell=${encodeURIComponent(p.id)}`,
        )
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Petak tidak terbaca.')
        setPilih(j)
      } catch (e) {
        setPesan(e instanceof Error ? e.message : String(e))
      }
    },
    [wpp, target],
  )

  /**
   * Ketuk heksagon BESAR → buka petak 2 km di dalamnya.
   *
   * Aturannya sama dengan laut-statis: besar dulu, baru kecil. Petak besar
   * adalah RATA-RATA puluhan petak di dalamnya, jadi keterangannya memang
   * ada — tetapi yang dipakai kapten untuk menentukan titik tebar adalah
   * petak kecilnya. Karena itu keduanya ditampilkan: panel langsung berisi
   * keterangan petak besar, dan petak kecilnya terbuka untuk dipilih.
   */
  const ketukBesar = useCallback(
    async (p: Petak) => {
      if (!wpp) return
      // Mengetuk petak besar yang SAMA dua kali menutup layer halusnya —
      // tanpa ini kapten tidak punya cara kembali ke pandangan seluruh
      // wilayah selain memuat ulang.
      if (indukHalus === p.id) {
        setHalus([])
        setIndukHalus(null)
        setPilih(null)
        setRute(null)
        return
      }
      bacaPetak(p)
      setIndukHalus(p.id)
      setHalus([])
      try {
        const r = await fetch(
          `/api/petak?wpp=${wpp}&target=${target}&induk=${encodeURIComponent(p.id)}`,
        )
        if (!r.ok) return
        const j = await r.json()
        setHalus(j.petak ?? [])
        setUkuranHalus(j.sizeDeg ?? 0.0079)
      } catch {
        /* layer halus gagal bukan alasan menutup keterangan petaknya */
      }
    },
    [wpp, target, bacaPetak, indukHalus],
  )

  const hitungRute = useCallback(
    async (ke: { lat: number; lon: number }) => {
      if (!wpp || !pangkal) return
      setRuteSibuk(true)
      setRute(null)
      try {
        const q = new URLSearchParams({
          wpp, target,
          dariLat: String(pangkal.lat), dariLon: String(pangkal.lon),
          keLat: String(ke.lat), keLon: String(ke.lon),
          kehatian,
        })
        const r = await fetch(`/api/rute?${q}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Rute gagal.')
        setRute(j)
      } catch (e) {
        setPesan(e instanceof Error ? e.message : 'Rute gagal dihitung.')
      } finally {
        setRuteSibuk(false)
      }
    },
    [wpp, target, pangkal, kehatian],
  )

  /**
   * Mulai mencatat di titik terpilih (mode Pencatatan Manual).
   *
   * Petak TERDEKAT ikut ditarik sebelum lembar penilaian dibuka. Tanpa itu
   * catatannya hanya berisi "ada ikan di koordinat X" — benar, tetapi tidak
   * bisa diadu dengan apa pun. Dengan skor model di titik itu ikut terekam,
   * satu catatan manual langsung jadi satu uji: model menduga sekian, kapten
   * menemukan sekian.
   */
  const mulaiCatat = useCallback(async () => {
    const t = pin ?? posisi
    if (!t || !wpp) return
    try {
      const r = await fetch(
        `/api/titik?wpp=${wpp}&target=${target}&lat=${t.lat}&lon=${t.lon}`,
      )
      if (r.ok) {
        const j = (await r.json()) as Info
        // Koordinat yang disimpan tetap titik KAPTEN, bukan pusat petak.
        setModeNilai('catat')
        setCatatDariPin(pin !== null)
        setMenilai({ ...j, lat: t.lat, lon: t.lon })
        return
      }
    } catch {
      /* di luar jangkauan model atau jaringan mati — catatan tetap boleh dibuat */
    }
    // Di luar wilayah terhitung: catat tanpa perkiraan model.
    setModeNilai('catat')
    setCatatDariPin(pin !== null)
    setMenilai({
      id: `TITIK-${t.lat.toFixed(4)},${t.lon.toFixed(4)}`,
      level: 'titik',
      lat: t.lat,
      lon: t.lon,
      // Skor 0 di sini BUKAN "model menilai 0", melainkan "tidak ada
      // perkiraan model di titik ini". `skorModel` yang dikirim ke basis data
      // ikut dinolkan jadi null di bawah supaya tidak terbaca sebagai
      // prediksi yang meleset total.
      skor: 0,
      kelas: 'cadangan',
      ombakM: null, ombakLabel: null, ombakBesar: null,
      anginKn: null, anginArahDeg: null, anginMataAngin: null,
      cuaca: null, risiko: null, risikoSebab: null, saran: null,
    })
  }, [pin, posisi, wpp, target])

  /**
   * Buka lembar penilaian — dengan penjagaan posisi untuk mode petak.
   *
   * Toleransinya SATU JARI-JARI PETAK, bukan jarak tetap. Petak besar
   * berjari-jari ±28 km dan petak 2 km hanya ±5,7 km; memakai satu angka
   * untuk keduanya berarti salah di salah satunya — terlalu longgar di petak
   * kecil, atau mustahil dipenuhi di petak besar.
   *
   * Pencatatan Manual tidak diperiksa sama sekali: di situ titiknya memang
   * posisi kapten sendiri, jadi tidak ada yang perlu dicocokkan.
   */
  const bukaPenilaian = useCallback(
    (p: Info) => {
      setPosisiCocok(null)
      setJarakKePetakKm(null)
      if (!posisi) {
        setPeringatan({
          keadaan: 'tanpa-gps',
          sebab: gpsGalat ?? 'Aplikasi belum menerima sinyal GPS.',
        })
        return
      }
      const km = jarakKm(posisi, p)
      const jariJariDeg = p.level === 'fine' ? ukuranHalus : ukuran
      const jariJariKm = jariJariDeg * 111.32
      setJarakKePetakKm(km)
      if (km <= jariJariKm) {
        setPosisiCocok(true)
        setModeNilai(mode)
        setMenilai(p)
        return
      }
      setPeringatan({ keadaan: 'jauh', jarakKm: km })
    },
    [posisi, gpsGalat, ukuran, ukuranHalus, mode],
  )

  const kirimPenilaian = async (isi: IsiValidasi) => {
    if (!menilai || !wpp) return
    setSimpanSibuk(true)
    // Ditulis ke perangkat LEBIH DULU, baru dikirim. Kalau urutannya dibalik
    // dan sinyal putus tepat setelah tombol ditekan, penilaiannya hilang —
    // dan kapten tidak akan mengetik ulang setibanya di darat.
    antrekan({
      wpp, target,
      cellKey: menilai.id,
      cellLevel: menilai.level,
      // `level === 'titik'` berarti tidak ada petak model di koordinat itu.
      // Mengirim skor 0 akan terbaca sebagai "model menduga 0 dan salah";
      // null berarti "model tidak punya dugaan di sini" — dua hal berbeda.
      skorModel: menilai.level === 'titik' ? null : menilai.skor,
      kelasModel: menilai.level === 'titik' ? null : menilai.kelas,
      risikoModel: menilai.risiko,
      // Koordinat yang dicatat adalah koordinat yang catatan ini BICARAKAN,
      // bukan selalu posisi GPS.
      //
      // Di Pencatatan Manual kapten boleh menandai titik di peta — misalnya
      // mengingat lokasi yang dilewati tadi. Sebelumnya `posisi` yang
      // terkirim, jadi peta menggambar pin di satu titik sementara basis data
      // menerima titik lain. Catatan "ada ikan di sini" jadi menunjuk tempat
      // yang salah, dan tidak ada apa pun di data yang menunjukkan hal itu
      // terjadi.
      //
      // `menilai.lat/lon` sudah berisi pin bila ada, posisi GPS bila tidak.
      lat: modeNilai === 'catat' ? menilai.lat : (posisi?.lat ?? null),
      lon: modeNilai === 'catat' ? menilai.lon : (posisi?.lon ?? null),
      tibaPada: new Date().toISOString(),
      // `catat` dilaporkan ke basis data sebagai `manual` — itu nama yang
      // dipakai spesifikasi tabel; `catat` hanya nama mode di layar.
      mode: modeNilai === 'catat' ? 'manual' : modeNilai,
      // `posisi_cocok` berarti satu hal yang sama di ketiga mode: apakah
      // koordinat yang dicatat memang tempat kapten berada.
      //
      //  - rekomendasi/eksplorasi : GPS berada di dalam petak yang dinilai
      //  - manual tanpa pin       : true, koordinatnya memang GPS-nya sendiri
      //  - manual dengan pin      : false, ia menandai tempat lain
      //  - GPS mati               : null, tidak ada yang bisa diperiksa
      //
      // Jarak untuk mode manual adalah jarak GPS ke titik yang ditandai —
      // ukuran seberapa jauh catatan itu dari tempat kapten sebenarnya.
      posisiCocok:
        modeNilai === 'catat'
          ? posisi
            ? !catatDariPin
            : null
          : posisiCocok,
      jarakKePetakKm:
        modeNilai === 'catat'
          ? posisi
            ? jarakKm(posisi, { lat: menilai.lat, lon: menilai.lon })
            : null
          : jarakKePetakKm,
      perangkat: idPerangkat(),
      ...isi,
    })
    const r = await kirimAntrean()
    setAntre(r.sisa)
    setSimpanSibuk(false)
    if (modeNilai === 'catat' && menilai) {
      setCatatan((c) => [...c, { lat: menilai.lat, lon: menilai.lon, hasil: isi.hasil }])
      setPin(null)
    }
    setMenilai(null)
    setPesan(
      r.sisa > 0
        ? 'Penilaian disimpan di perangkat, akan dikirim saat ada sinyal.'
        : 'Terima kasih — penilaian Anda tersimpan.',
    )
  }

  useEffect(() => {
    if (!pesan) return
    const t = setTimeout(() => setPesan(null), 4200)
    return () => clearTimeout(t)
  }, [pesan])

  if (!siap) return <div className="h-full bg-[#eef2f6]" />

  if (langkah === 'wpp')
    return (
      <PilihWpp
        daftar={daftar}
        memuat={daftarMemuat}
        galat={daftarGalat}
        target={target}
        onTarget={(t) => { setTarget(t); simpan(K_TARGET, t) }}
        onPilih={(kode) => { setWpp(kode); simpan(K_WPP, kode); setLangkah('mode') }}
      />
    )

  if (langkah === 'mode')
    return (
      <PilihMode
        namaWpp={daftar.find((d) => d.kode === wpp)?.nama ?? `WPP ${wpp}`}
        targetLabel={`Pelagis ${target === 'kecil' ? 'Kecil' : 'Besar'}`}
        onKembali={() => setLangkah('wpp')}
        onPilih={(m) => { setMode(m); simpan(K_MODE, m); setLangkah('peta') }}
      />
    )

  const jarak = pilih && pangkal
    ? {
        km: jarakKm(pangkal, pilih),
        arah: bearingDeg(pangkal, pilih),
        lama: lamaManusiawi(jamTempuh(jarakKm(pangkal, pilih), 8)),
      }
    : null

  return (
    <div className="relative h-full overflow-hidden bg-[#eef2f6]">
      <PetaKapten
        petak={petak}
        ukuranDeg={ukuran}
        petakHalus={halus}
        ukuranHalusDeg={ukuranHalus}
        terpilih={pilih?.id ?? null}
        // Mode Rekomendasi menyalakan HANYA kuadran `utama` — petak hijau,
        // yang potensinya tinggi DAN terjangkau. Sisanya diredupkan, tidak
        // dihapus: kapten tetap perlu melihat bentuk perairannya, dan perlu
        // tahu bahwa pilihan terbaiknya memang sedikit.
        //
        // Mode Eksplorasi tidak menyorot apa pun — di situ kapten memang
        // sedang memeriksa seluruh wilayah, termasuk yang tidak dianjurkan.
        sorotKelas={mode === 'rekomendasi' ? ['utama'] : null}
        catatan={catatan}
        pin={mode === 'catat' ? pin : null}
        onPetak={mode === 'catat' ? (p) => setPin({ lat: p.lat, lon: p.lon }) : ketukBesar}
        onPetakHalus={mode === 'catat' ? (p) => setPin({ lat: p.lat, lon: p.lon }) : bacaPetak}
        rute={rute}
        posisiKapal={posisi}
        arahKapal={arah}
        ikutiKapal={ikuti}
        fokus={fokus}
        onGlyphs={setAdaAngka}
      />

      {/* ---- bilah atas ---- */}
      <div
        className="absolute inset-x-0 top-0 z-20 px-3 pb-2"
        style={{ paddingTop: 'calc(var(--aman-atas) + 8px)' }}
      >
        <div className="box-cut kaca px-3 py-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1.5">
            <Merek ringkas />
            <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wider text-[var(--navy)]">
              Smart Fisheries
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1.5">
          <button
            onClick={() => setLangkah('wpp')}
            className="sentuh flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span
              className="box-cut flex h-9 w-9 shrink-0 items-center justify-center text-[11px] font-extrabold text-white"
              style={{ background: 'var(--navy)' }}
            >
              {infoWpp?.kode ?? wpp}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-[var(--navy)]">
                {infoWpp?.nama ?? (memuat ? 'Memuat…' : `WPP ${wpp}`)}
              </span>
              <span className="block truncate text-[10px] text-zinc-500">
                {infoWpp?.targetLabel ?? ''} · {petak.length} petak
                {halus.length > 0 ? ` · ${halus.length} petak 2 km` : ''}
              </span>
            </span>
          </button>
          <button
            onClick={() => {
              // Berputar tiga arah. Dengan tiga mode, sakelar dua-arah
              // menyisakan satu mode yang hanya bisa dicapai lewat layar awal.
              const urut: Mode[] = ['rekomendasi', 'eksplorasi', 'catat']
              const m = urut[(urut.indexOf(mode) + 1) % urut.length]
              setMode(m)
              simpan(K_MODE, m)
              bersihkanInteraksi()
            }}
            className="box-cut tekan shrink-0 px-2.5 py-1.5 text-[10px] font-bold"
            style={{
              background:
                mode === 'rekomendasi'
                  ? 'var(--indigo)'
                  : mode === 'eksplorasi'
                    ? 'var(--utama)'
                    : 'var(--cadangan)',
              color: mode === 'catat' ? '#1f1300' : '#fff',
            }}
          >
            {mode === 'rekomendasi' ? 'REKOMENDASI' : mode === 'eksplorasi' ? 'EKSPLORASI' : 'CATAT'}
          </button>
          </div>
        </div>

        {/* Sakelar target — dipasang di peta, bukan hanya di layar awal.
            Pelagis kecil dan besar adalah DUA MODEL berbeda: bobot, kurva
            kesesuaian, dan kuadrannya tidak sama, jadi petak yang hijau untuk
            satu target bisa merah untuk target lainnya. Menyembunyikannya di
            layar awal memaksa kapten keluar dari peta hanya untuk melihat
            pembandingnya. */}
        <div className="box-cut kaca mt-1.5 flex gap-1 p-1">
          {(['kecil', 'besar'] as Target[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTarget(t); simpan(K_TARGET, t) }}
              aria-pressed={target === t}
              className="box-cut tekan flex-1 py-1.5 text-[11px] font-bold"
              style={{
                background: target === t ? 'var(--indigo)' : 'transparent',
                color: target === t ? '#fff' : '#475569',
              }}
            >
              Pelagis {t === 'kecil' ? 'Kecil' : 'Besar'}
            </button>
          ))}
        </div>
      </div>

      {/* ---- kendali kanan ---- */}
      <div
        className="pointer-events-none absolute right-3 z-20 flex flex-col items-end gap-2"
        style={{ top: 'calc(var(--aman-atas) + 118px)' }}
      >
        {/* Tombol kendali DI ATAS panel iklim.
            Panel iklim kini terbuka sejak awal dan tingginya berubah-ubah;
            menaruh tombol di bawahnya berarti tombol bergeser setiap kali isi
            panel berubah, dan pada layar 844 px ia terdorong sampai ke balik
            lembar bawah — tidak bisa disentuh sama sekali. */}
        <button
          onClick={() => setIkuti((v) => !v)}
          aria-label="Ikuti posisi kapal"
          className="pointer-events-auto box-cut kaca tekan flex h-11 w-11 items-center justify-center"
        >
          <span style={{ color: ikuti ? 'var(--indigo)' : '#94a3b8', fontSize: 17 }}>➤</span>
        </button>
        {halus.length > 0 && (
          <button
            onClick={() => { setHalus([]); setIndukHalus(null); setPilih(null) }}
            aria-label="Tutup petak 2 km"
            className="pointer-events-auto box-cut kaca tekan flex h-11 w-11 items-center justify-center text-[15px] text-[var(--navy)]"
          >
            ⤬
          </button>
        )}
        <PanelIklim data={iklim} galat={iklimGalat} namaPetak={pilih?.id ?? null} />
      </div>

      {pesan && (
        <div
          className="box-cut absolute left-1/2 z-40 -translate-x-1/2 px-3 py-2 text-[11px] font-medium text-white"
          style={{ top: 'calc(var(--aman-atas) + 118px)', background: 'rgba(0,33,71,0.92)' }}
        >
          {pesan}
        </div>
      )}

      {/* ---- panel bawah: PANDUAN CUACA petak terpilih ---- */}
      <div className="kaca absolute inset-x-0 bottom-0 z-20 max-h-[62%] overflow-auto sembunyi-gulir rounded-t-[18px]">
        <div className="sticky top-0 z-10 flex justify-center py-2">
          <span className="gagang" />
        </div>

        {peringatan ? (
          <PeringatanPosisi
            posisi={peringatan}
            namaPetak={pilih?.id ?? '—'}
            onBatal={() => setPeringatan(null)}
            onTetapLanjut={() => {
              setPosisiCocok(false)
              setPeringatan(null)
              setModeNilai(mode)
              if (pilih) setMenilai(pilih)
            }}
          />
        ) : menilai ? (
          <LembarValidasi
            namaArea={
              modeNilai === 'catat'
                ? koordinat(menilai.lat, menilai.lon)
                : `Petak ${menilai.id}`
            }
            skorModel={menilai.skor}
            kelasModel={LABEL_KUADRAN[menilai.kelas] ?? menilai.kelas}
            manual={modeNilai === 'catat'}
            sibuk={simpanSibuk}
            onBatal={() => setMenilai(null)}
            onKirim={kirimPenilaian}
          />
        ) : mode === 'catat' ? (
          // Didahulukan atas `pilih`: di mode Pencatatan Manual, petak yang
          // kebetulan masih terpilih tidak boleh menggantikan panel catat.
          <PanelCatat
            posisi={posisi}
            akurasiM={akurasiM}
            gpsGalat={gpsGalat}
            pin={pin}
            onPakaiGps={() => { if (posisi) setIkuti(true) }}
            onBatalPin={() => setPin(null)}
            onCatat={mulaiCatat}
            antre={antre}
            jumlahCatatan={catatan.length}
          />
        ) : pilih ? (
          <Cuaca
            p={pilih}
            jarak={jarak}
            dariKapal={dariKapal}
            indukHalus={indukHalus}
            rute={rute}
            ruteSibuk={ruteSibuk}
            kehatian={kehatian}
            onKehatian={(k) => { setKehatian(k); setRute(null) }}
            onRute={() => hitungRute(pilih)}
            onTutup={() => { setPilih(null); setRute(null) }}
            onNilai={() => bukaPenilaian(pilih)}
          />
        ) : (
          <Pembuka
            memuat={memuat}
            galat={galat}
            adaAngka={adaAngka}
            gpsGalat={gpsGalat}
            antre={antre}
            mode={mode}
          />
        )}
      </div>
    </div>
  )
}

// =========================================================================

function Pembuka({
  memuat, galat, adaAngka, gpsGalat, antre, mode,
}: {
  memuat: boolean
  galat: string | null
  adaAngka: boolean
  gpsGalat: string | null
  antre: number
  mode: Mode
}) {
  return (
    <div
      className="px-5 pb-6 pt-1 text-center"
      style={{ paddingBottom: 'calc(var(--aman-bawah) + 20px)' }}
    >
      {memuat ? (
        <p className="py-3 text-[13px] text-zinc-500">Memuat petak…</p>
      ) : galat ? (
        <p className="py-3 text-[13px] text-red-600">{galat}</p>
      ) : (
        <>
          <p className="text-[15px] font-extrabold text-[var(--navy)]">Ketuk petak di peta</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] leading-relaxed text-zinc-600">
            {mode === 'rekomendasi'
              ? 'Yang menyala hanya petak hijau — potensi tinggi dan terjangkau. Ketuk satu petak besar untuk membuka petak 2 km di dalamnya.'
              : 'Seluruh petak wilayah tergambar — pilih sendiri yang mana. Ketuk petak besar untuk membuka petak 2 km di dalamnya.'}
          </p>
          <Legenda sorot={mode === 'rekomendasi' ? ['utama'] : null} />
          {!adaAngka && (
            <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
              Angka di petak tidak tampil: peta sedang memakai peta dasar OSM yang
              tidak menyediakan huruf. Warna petak tetap benar.
            </p>
          )}
        </>
      )}
      {gpsGalat && <p className="mt-2 text-[10px] text-amber-700">{gpsGalat}</p>}
      {antre > 0 && (
        <p className="mt-1 text-[10px] text-zinc-500">{antre} penilaian menunggu terkirim.</p>
      )}
    </div>
  )
}

function Legenda({ sorot = null }: { sorot?: string[] | null }) {
  const menyorot = Boolean(sorot?.length)
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {(['utama', 'ekspedisi', 'cadangan', 'hindari'] as const).map((k) => {
        const redup = menyorot && !sorot!.includes(k)
        return (
          <span
            key={k}
            className="flex items-center gap-1 text-[10px]"
            style={{ color: redup ? '#a1a1aa' : '#52525b' }}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0"
              style={{ background: WARNA_KUADRAN[k], opacity: redup ? 0.25 : 1 }}
            />
            {LABEL_KUADRAN[k]}
          </span>
        )
      })}
    </div>
  )
}

// =========================================================================

/**
 * Panduan cuaca satu petak — satu-satunya isi panel.
 *
 * Tidak ada rincian variabel, bobot, kesesuaian, atau sumber data: itu
 * pekerjaan analis. Yang ada di sini hanya yang mengubah keputusan kapten —
 * seberapa jauh, aman atau tidak, dan apa sarannya.
 */
function Cuaca({
  p, jarak, dariKapal, indukHalus, rute, ruteSibuk, kehatian, onKehatian, onRute, onTutup, onNilai,
}: {
  p: Info
  jarak: { km: number; arah: number; lama: string } | null
  dariKapal: boolean
  indukHalus: string | null
  rute: HasilRute | null
  ruteSibuk: boolean
  kehatian: 'normal' | 'ketat'
  onKehatian: (k: 'normal' | 'ketat') => void
  onRute: () => void
  onTutup: () => void
  onNilai: () => void
}) {
  const warna = WARNA_RISIKO[p.risiko ?? ''] ?? '#94a3b8'
  return (
    <div style={{ paddingBottom: 'calc(var(--aman-bawah) + 14px)' }}>
      <div className="flex items-start justify-between gap-3 px-5 pb-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-extrabold leading-none text-[var(--navy)]">
              {Math.round(p.skor)}
            </span>
            <span className="text-[11px] text-zinc-500">dari 100</span>
            <span
              className="box-cut px-2 py-0.5 text-[9px] font-bold text-white"
              style={{ background: WARNA_KUADRAN[p.kelas] ?? '#2e3192' }}
            >
              {LABEL_KUADRAN[p.kelas] ?? p.kelas}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
            {koordinat(p.lat, p.lon)} · petak {p.level === 'fine' ? '2 km' : 'besar'}
            {p.level === 'fine' && indukHalus ? ` di ${indukHalus}` : ''}
          </p>
        </div>
        <button onClick={onTutup} className="sentuh text-[12px] font-semibold text-[var(--indigo)]">
          Tutup
        </button>
      </div>

      {jarak && (
        <div className="box-cut mx-5 mb-2 flex items-center gap-3 bg-white/70 px-3 py-2.5">
          <span
            className="shrink-0 text-[22px] leading-none"
            style={{ transform: `rotate(${jarak.arah}deg)`, color: 'var(--indigo)' }}
            aria-hidden
          >
            ↑
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold leading-tight text-[var(--navy)]">
              {Math.round(jarak.km)} km · {mataAngin(jarak.arah)}
            </span>
            <span className="block text-[10px] text-zinc-500">
              ±{jarak.lama} pada 8 knot ·{' '}
              {dariKapal ? 'dari posisi kapal' : 'dari titik acuan wilayah'}
            </span>
          </span>
        </div>
      )}

      {/* ---- panduan cuaca ---- */}
      <div className="box-cut mx-5 mb-2 bg-white/70 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warna }} />
          <span className="text-[13px] font-bold capitalize text-[var(--navy)]">
            {p.risiko ?? 'belum dinilai'}
          </span>
          {p.risikoSebab && (
            <span className="truncate text-[10px] text-zinc-500">— {p.risikoSebab}</span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-700">
          {p.saran ?? 'Keterangan kondisi laut belum tersedia untuk petak ini.'}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Angka label="Ombak" nilai={p.ombakM != null ? `${p.ombakM.toFixed(2)} m` : '—'}
            sub={p.ombakBesar ? 'besar' : p.ombakLabel ? 'tenang' : ''} />
          <Angka label="Angin" nilai={p.anginKn != null ? `${Math.round(p.anginKn)} kn` : '—'}
            sub={p.anginMataAngin ? `dari ${p.anginMataAngin}` : ''} />
          <Angka label="Cuaca" nilai={p.cuaca ?? '—'} sub="" />
        </div>
      </div>

      {/* ---- rute ---- */}
      <div className="mx-5 mb-2">
        <div className="mb-1.5 flex gap-1.5">
          {(['normal', 'ketat'] as const).map((k) => (
            <button
              key={k}
              onClick={() => onKehatian(k)}
              className="box-cut tekan flex-1 py-1.5 text-[11px] font-semibold"
              style={{
                background: kehatian === k ? 'var(--indigo)' : 'rgba(255,255,255,0.75)',
                color: kehatian === k ? '#fff' : '#334155',
                border: kehatian === k ? 'none' : '1px solid rgba(0,33,71,0.12)',
              }}
            >
              {k === 'normal' ? 'Tercepat' : 'Teraman'}
            </button>
          ))}
        </div>
        <button
          onClick={onRute}
          disabled={ruteSibuk}
          className="box-cut sentuh tekan w-full bg-white/80 text-[13px] font-bold text-[var(--navy)] disabled:opacity-50"
          style={{ border: '1px solid rgba(0,33,71,0.12)' }}
        >
          {ruteSibuk ? 'Mencari rute…' : rute ? 'Hitung ulang rute' : 'Tunjukkan rute ke sini'}
        </button>

        {rute && (
          <div className="box-cut mt-1.5 bg-white/70 px-3 py-2.5 text-[12px]">
            <p className="font-bold text-[var(--navy)]">
              {Math.round(rute.jarakKm)} km · ±{lamaManusiawi(rute.jamTempuh)}
            </p>
            <p className="mt-0.5 leading-relaxed text-zinc-600">
              {rute.nBurukRute === 0
                ? 'Jalur ini tidak melewati satu pun petak bercuaca buruk.'
                : `Masih melewati ${rute.nBurukRute} petak bercuaca buruk — tidak ada jalur yang sepenuhnya bersih.`}{' '}
              Angin {rute.anginLabel}.
            </p>
            {/* Pembanding jujur: selisih terhadap jalur terpendek DI GRID YANG
                SAMA, bukan terhadap garis lurus. Rute selalu lebih panjang
                dari garis lurus karena menyusuri pusat petak, dan menyebut
                selisih itu "ongkos menghindari cuaca" adalah klaim palsu. */}
            {rute.jarakNetralKm > 0 && rute.jarakKm > rute.jarakNetralKm * 1.02 && (
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {Math.round(rute.jarakKm - rute.jarakNetralKm)} km lebih jauh daripada jalur
                terpendek — itulah ongkos menghindari cuacanya.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mx-5">
        <button
          onClick={onNilai}
          className="box-cut sentuh tekan w-full text-[14px] font-bold text-white"
          style={{ background: 'var(--utama)' }}
        >
          Saya sudah sampai — nilai petak ini
        </button>
        <p className="mt-1.5 text-center text-[10px] leading-relaxed text-zinc-500">
          Penilaian Anda yang menentukan apakah rekomendasi ini benar.
        </p>
      </div>
    </div>
  )
}

function Angka({ label, nilai, sub }: { label: string; nilai: string; sub: string }) {
  return (
    <div className="box-cut bg-white/80 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="truncate text-[13px] font-bold text-[var(--navy)]">{nilai}</div>
      {sub && <div className="truncate text-[9px] text-zinc-500">{sub}</div>}
    </div>
  )
}
