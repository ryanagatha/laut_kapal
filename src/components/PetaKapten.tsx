'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { config } from '@/lib/config'
import { warnaPetak } from '@/lib/warna'

/**
 * Peta heksagon untuk kapten.
 *
 * Mekanismenya sengaja SAMA PERSIS dengan peta laut-statis: dua layer
 * heksagon (besar dan 2 km), angka indeks prioritas di tengah tiap petak,
 * dan drill-down dengan mengetuk petak besar. Yang tidak ikut hanyalah panel
 * analisisnya — kapten tidak sedang mengaudit model.
 *
 * Angkanya digambar sebagai SYMBOL LAYER MapLibre, bukan penanda DOM. Bedanya
 * menentukan: penanda DOM berarti satu elemen per petak, dan pada ribuan
 * petak itu membebani DOM sekaligus saling tumpang tindih sampai tak satu pun
 * terbaca. Symbol layer digambar GPU dan punya penanganan tabrakan bawaan —
 * label yang tidak muat disembunyikan sendiri lalu muncul saat diperbesar.
 */

export type Petak = {
  id: string
  lat: number
  lon: number
  skor: number
  kelas: string
}

export type Rute = { titik: { lat: number; lon: number; kelas: string }[] } | null

/**
 * Poligon heksagon pointy-top dari titik pusat.
 *
 * Sudut mulai 30° agar puncaknya di atas — sama dengan generator grid
 * pipeline. Offset yang berbeda membuat petak tampak bergeser setengah baris
 * terhadap koordinat yang dilaporkan.
 */
function heksagon(lon: number, lat: number, ukuran: number): [number, number][] {
  const t: [number, number][] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k + 30)
    t.push([
      +(lon + ukuran * Math.cos(a)).toFixed(5),
      +(lat + ukuran * Math.sin(a)).toFixed(5),
    ])
  }
  t.push(t[0])
  return t
}

function fitur(petak: Petak[], ukuran: number, sorotKelas?: string[] | null) {
  const sorotkan = sorotKelas && sorotKelas.length > 0
  return {
    type: 'FeatureCollection' as const,
    features: petak.map((p, i) => ({
      type: 'Feature' as const,
      id: i,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [heksagon(p.lon, p.lat, ukuran)],
      },
      properties: {
        id: p.id,
        lat: p.lat,
        lon: p.lon,
        kelas: p.kelas,
        prio: Math.round(p.skor),
        color: warnaPetak(p.kelas, p.skor),
        hindari: p.kelas === 'hindari',
        redup: Boolean(sorotkan && !sorotKelas!.includes(p.kelas)),
      },
    })),
  }
}

export function PetaKapten({
  petak = [],
  ukuranDeg = 0.1,
  petakHalus = [],
  ukuranHalusDeg = 0.0079,
  terpilih = null,
  sorotKelas = null,
  onPetak,
  onPetakHalus,
  rute = null,
  catatan = [],
  pin = null,
  posisiKapal = null,
  arahKapal = null,
  ikutiKapal = false,
  fokus = null,
  onGlyphs,
}: {
  petak?: Petak[]
  ukuranDeg?: number
  /** Layer 2 km — hanya terisi setelah satu petak besar di-drill. */
  petakHalus?: Petak[]
  ukuranHalusDeg?: number
  terpilih?: string | null
  /**
   * Kuadran yang disorot; sisanya diredupkan jadi latar.
   *
   * Dipakai mode Rekomendasi untuk menyalakan hanya petak `utama`. Petak lain
   * TIDAK dihapus — kapten tetap perlu melihat bentuk perairannya dan tahu
   * bahwa pilihan hijau itu sedikit. Menghapusnya membuat laut tampak kosong
   * dan menyembunyikan betapa jarangnya petak terbaik: pada run 712/kecil
   * hanya 9 dari 200 petak berkelas `utama`.
   */
  sorotKelas?: string[] | null
  onPetak?: (p: Petak) => void
  onPetakHalus?: (p: Petak) => void
  rute?: Rute
  /** Titik yang sudah dicatat sesi ini — penanda kecil di peta. */
  catatan?: { lat: number; lon: number; hasil: string }[]
  /** Titik yang sedang ditandai untuk dicatat (mode Pencatatan Manual). */
  pin?: { lat: number; lon: number } | null
  posisiKapal?: { lat: number; lon: number } | null
  arahKapal?: number | null
  ikutiKapal?: boolean
  fokus?: { lat: number; lon: number; zoom?: number } | [[number, number], [number, number]] | null
  /** Dilaporkan ke induk: style punya glyphs atau tidak (angka petak muncul?). */
  onGlyphs?: (ada: boolean) => void
}) {
  const wadah = useRef<HTMLDivElement>(null)
  const peta = useRef<maplibregl.Map | null>(null)
  const kapalRef = useRef<maplibregl.Marker | null>(null)
  const catatanRef = useRef<maplibregl.Marker[]>([])
  const pinRef = useRef<maplibregl.Marker | null>(null)
  const [siap, setSiap] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  /** Pembersih peta, diisi setelah peta benar-benar dibuat (lihat efek init). */
  const bersihRef = useRef<(() => void) | null>(null)

  // Handler dipasang sekali pada 'load', jadi harus membaca nilai terbaru
  // lewat ref — bukan closure render pertama.
  const onPetakRef = useRef(onPetak)
  const onHalusRef = useRef(onPetakHalus)
  onPetakRef.current = onPetak
  onHalusRef.current = onPetakHalus

  useEffect(() => {
    if (!wadah.current || peta.current) return
    let dibatalkan = false

    const styleOsm: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [config.mapTileUrl],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    }

    /**
     * Style dipilih dengan benar-benar MENGAMBILNYA lebih dulu.
     *
     * Versi sebelumnya hanya memeriksa "key-nya terisi atau tidak", lalu
     * menyerahkan sisanya kepada MapLibre. Itu cacat: key MapTiler dibatasi
     * per-domain, dan ketika domainnya ditolak MapLibre menerima 403,
     * memancarkan `error`, lalu BERHENTI — `load` tidak pernah menyala,
     * seluruh layer heksagon tidak pernah ditambahkan, dan yang dilihat
     * pengguna adalah layar kosong, bukan peta cadangan. Persis yang terjadi
     * saat aplikasi dibuka lewat alamat Wi-Fi, bukan localhost.
     *
     * Diuji lebih dulu di sini, penolakannya menjadi keputusan — bukan
     * kebuntuan.
     */
    const pilihStyle = async (): Promise<{
      style: string | maplibregl.StyleSpecification
      cadangan: boolean
    }> => {
      if (!config.mapStyleUrl) return { style: styleOsm, cadangan: false }
      try {
        const r = await fetch(config.mapStyleUrl, { cache: 'no-store' })
        if (r.ok) return { style: config.mapStyleUrl, cadangan: false }
      } catch {
        /* jaringan atau CORS — hasilnya sama, pakai cadangan */
      }
      return { style: styleOsm, cadangan: true }
    }

    pilihStyle().then(({ style, cadangan }) => {
      if (dibatalkan || !wadah.current || peta.current) return
      if (cadangan) setGalat('Peta vektor ditolak di alamat ini — memakai peta dasar OSM.')

      let m: maplibregl.Map
      try {
        m = new maplibregl.Map({
          container: wadah.current,
          style,
          center: [117, -4],
          zoom: 4.2,
          attributionControl: false,
        })
      } catch (e) {
        setGalat(e instanceof Error ? e.message : 'Peta gagal dimuat')
        return
      }
      peta.current = m

      m.on('error', (e) => {
        const pesan = (e as { error?: { message?: string } })?.error?.message
        if (pesan && /key|403|forbidden/i.test(pesan)) setGalat('Peta terbatas: ' + pesan)
      })

      m.on('load', () => {
      // ---- layer besar ----
      m.addSource('petak', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'petak-isi',
        type: 'fill',
        source: 'petak',
        paint: {
          'fill-color': ['get', 'color'],
          // Opasitas 0,78 — sama persis dengan laut-statis, cukup pekat agar
          // pola sebarannya terbaca seperti peta risiko.
          //
          // Petak `hindari` TIDAK diredupkan. Meredupkannya terasa masuk akal
          // ("yang penting kan yang bagus"), tetapi akibatnya laut tampak
          // seragam dan kapten kehilangan satu-satunya petunjuk visual bahwa
          // sebagian besar perairan hari itu memang tidak layak dituju — pada
          // run 712/kecil, 101 dari 200 petak berkelas `hindari`.
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'terpilih'], false], 0.95,
            ['boolean', ['get', 'redup'], false], 0.1,
            0.78,
          ],
        },
      })
      m.addLayer({
        id: 'petak-garis',
        type: 'line',
        source: 'petak',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'terpilih'], false],
            '#ffffff',
            'rgba(255,255,255,0.35)',
          ],
          'line-width': ['case', ['boolean', ['feature-state', 'terpilih'], false], 2.5, 0.5],
        },
      })

      // ---- layer 2 km, digambar di atas layer besar ----
      m.addSource('halus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'halus-isi',
        type: 'fill',
        source: 'halus',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case', ['boolean', ['feature-state', 'terpilih'], false], 0.98, 0.88,
          ],
        },
      })
      m.addLayer({
        id: 'halus-garis',
        type: 'line',
        source: 'halus',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'terpilih'], false],
            '#ffffff',
            'rgba(255,255,255,0.45)',
          ],
          'line-width': ['case', ['boolean', ['feature-state', 'terpilih'], false], 2.5, 0.6],
        },
      })

      // ---- angka indeks prioritas ----
      //
      // Butuh glyphs. Style vektor MapTiler memuatnya; raster cadangan tidak,
      // dan menambahkan symbol layer tanpa glyphs membuat peta gagal TOTAL —
      // bukan sekadar kehilangan angka. Karena itu dijaga pemeriksaan ini.
      const adaGlyphs = Boolean((m.getStyle() as maplibregl.StyleSpecification)?.glyphs)
      onGlyphs?.(adaGlyphs)
      if (adaGlyphs) {
        const layerLabel = (
          id: string,
          source: string,
          ukuran: maplibregl.DataDrivenPropertyValueSpecification<number>,
          minzoom?: number,
        ): maplibregl.SymbolLayerSpecification => ({
          id,
          type: 'symbol',
          source,
          ...(minzoom === undefined ? {} : { minzoom }),
          layout: {
            'text-font': ['Noto Sans Bold'],
            'text-field': ['to-string', ['get', 'prio']],
            'text-size': ukuran,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 1,
          },
          paint: {
            // Teks terang dengan halo gelap tebal. Halo bukan hiasan:
            // heksagonnya berwarna dari merah sampai hijau tua, dan tanpa
            // halo teks terang hilang di petak terang dan menyatu di gelap.
            'text-color': '#f1f5f9',
            'text-halo-color': 'rgba(2,6,23,0.85)',
            'text-halo-width': 1.6,
            'text-halo-blur': 0.4,
          },
        })
        // `minzoom` pada layer besar: pada zoom awal satu WPP memuat ratusan
        // petak dalam satu layar, dan angka di tiap petak berubah jadi derau.
        // Warna sudah menyampaikan pola sebarannya; angka baru berguna saat
        // petaknya cukup besar untuk dibaca satu per satu.
        m.addLayer(
          layerLabel('petak-angka', 'petak',
            ['interpolate', ['linear'], ['zoom'], 6, 10, 9, 13, 12, 16], 6),
        )
        // Layer 2 km tanpa minzoom: ia baru muncul setelah di-drill, dan pada
        // saat itu peta memang sudah diperbesar.
        m.addLayer(
          layerLabel('halus-angka', 'halus',
            ['interpolate', ['linear'], ['zoom'], 8, 9, 11, 12, 14, 15]),
        )
      }

      // ---- rute ----
      m.addSource('rute', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'rute-bayang',
        type: 'line',
        source: 'rute',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': 'rgba(0,0,0,0.3)', 'line-width': 9 },
      })
      m.addLayer({
        id: 'rute-garis',
        type: 'line',
        source: 'rute',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'kelas'],
            'bahaya', '#ef4444',
            'waspada', '#eab308',
            '#2e3192',
          ],
          'line-width': 4.5,
        },
      })

      const ambil = (f: maplibregl.MapGeoJSONFeature): Petak => {
        const p = f.properties as Record<string, unknown>
        return {
          id: String(p.id),
          lat: Number(p.lat),
          lon: Number(p.lon),
          skor: Number(p.prio),
          kelas: String(p.kelas),
        }
      }

      // Ketukan pada petak besar diabaikan bila di titik itu ada petak 2 km —
      // layer halus digambar di atasnya dan dialah yang dimaksud pengguna.
      m.on('click', 'petak-isi', (e) => {
        if (m.queryRenderedFeatures(e.point, { layers: ['halus-isi'] }).length > 0) return
        const f = e.features?.[0]
        if (f) onPetakRef.current?.(ambil(f))
      })
      m.on('click', 'halus-isi', (e) => {
        const f = e.features?.[0]
        if (f) onHalusRef.current?.(ambil(f))
      })
      for (const l of ['petak-isi', 'halus-isi']) {
        m.on('mouseenter', l, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', l, () => (m.getCanvas().style.cursor = ''))
      }

      setSiap(true)
      })

      // Observer dipasang DI DALAM `.then()` karena `m` baru ada di sini.
      // Pembersihannya disimpan di ref supaya fungsi cleanup efek — yang
      // berjalan di luar promise ini — tetap bisa menjangkaunya.
      const ro = new ResizeObserver(() => m.resize())
      if (wadah.current) ro.observe(wadah.current)
      bersihRef.current = () => {
        ro.disconnect()
        catatanRef.current.forEach((x) => x.remove())
        catatanRef.current = []
        pinRef.current?.remove()
        pinRef.current = null
        kapalRef.current?.remove()
        kapalRef.current = null
        m.remove()
        peta.current = null
        setSiap(false)
      }
    })

    return () => {
      dibatalkan = true
      bersihRef.current?.()
      bersihRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- data petak ---------------------------------------------------------
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    ;(m.getSource('petak') as maplibregl.GeoJSONSource | undefined)?.setData(
      fitur(petak, ukuranDeg, sorotKelas),
    )
    // Angka di petak redup ikut disembunyikan. Angka yang tetap terbaca di
    // petak yang sengaja dipudarkan menarik mata ke tempat yang justru
    // sedang tidak direkomendasikan.
    if (m.getLayer('petak-angka')) {
      m.setFilter(
        'petak-angka',
        sorotKelas && sorotKelas.length > 0
          ? ['!', ['boolean', ['get', 'redup'], false]]
          : null,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petak, ukuranDeg, sorotKelas?.join(','), siap])

  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    ;(m.getSource('halus') as maplibregl.GeoJSONSource | undefined)?.setData(
      fitur(petakHalus, ukuranHalusDeg),
    )

    // Begitu petak 2 km terbuka, isi petak BESAR dikosongkan — yang berwarna
    // hanya petak kecil di area yang sedang diperiksa.
    //
    // Konteks wilayah tidak hilang: garis tepi petak besar tetap digambar,
    // hanya ditipiskan jadi latar.
    const detail = petakHalus.length > 0
    m.setPaintProperty(
      'petak-isi',
      'fill-opacity',
      detail
        ? 0
        : [
            'case',
            ['boolean', ['feature-state', 'terpilih'], false], 0.95,
            ['boolean', ['get', 'redup'], false], 0.1,
            0.78,
          ],
    )
    // Angkanya ikut disembunyikan. Mengosongkan isinya saja tidak cukup:
    // angka induk tetap melayang di atas petak 2 km dan terbaca seolah nilai
    // petak kecil itu — padahal ia nilai rata-rata puluhan petak. Itu salah
    // baca yang paling merugikan, karena kapten membuka detail justru untuk
    // menghindari angka agregat.
    if (m.getLayer('petak-angka')) {
      m.setLayoutProperty('petak-angka', 'visibility', detail ? 'none' : 'visible')
    }
    m.setPaintProperty(
      'petak-garis',
      'line-color',
      detail
        ? 'rgba(255,255,255,0.18)'
        : [
            'case',
            ['boolean', ['feature-state', 'terpilih'], false],
            '#ffffff',
            'rgba(255,255,255,0.35)',
          ],
    )
  }, [petakHalus, ukuranHalusDeg, siap])

  // ---- sorotan petak terpilih ---------------------------------------------
  //
  // Lewat feature-state, bukan dengan menggambar ulang sumbernya: mengganti
  // data GeoJSON hanya untuk menandai satu petak berarti mengunggah ulang
  // seluruh geometri ke GPU setiap kali kapten menyentuh petak lain.
  const sorotRef = useRef<{ source: string; id: number } | null>(null)
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    if (sorotRef.current) {
      m.setFeatureState(sorotRef.current, { terpilih: false })
      sorotRef.current = null
    }
    if (!terpilih) return
    const iHalus = petakHalus.findIndex((p) => p.id === terpilih)
    if (iHalus >= 0) {
      sorotRef.current = { source: 'halus', id: iHalus }
    } else {
      const i = petak.findIndex((p) => p.id === terpilih)
      if (i < 0) return
      sorotRef.current = { source: 'petak', id: i }
    }
    m.setFeatureState(sorotRef.current, { terpilih: true })
  }, [terpilih, petak, petakHalus, siap])

  // ---- rute ---------------------------------------------------------------
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    const src = m.getSource('rute') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (!rute || rute.titik.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    // Satu ruas per segmen, supaya warna cuaca berubah di sepanjang jalur
    // alih-alih satu warna untuk seluruh rute.
    src.setData({
      type: 'FeatureCollection',
      features: rute.titik.slice(0, -1).map((a, i) => {
        const b = rute.titik[i + 1]
        const kelas =
          a.kelas === 'bahaya' || b.kelas === 'bahaya'
            ? 'bahaya'
            : a.kelas === 'waspada' || b.kelas === 'waspada'
              ? 'waspada'
              : 'aman'
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [[a.lon, a.lat], [b.lon, b.lat]],
          },
          properties: { kelas },
        }
      }),
    })
  }, [rute, siap])

  // ---- titik yang sudah dicatat -------------------------------------------
  const WARNA_HASIL: Record<string, string> = {
    banyak: '#16a34a',
    sedang: '#eab308',
    sepi: '#ef4444',
  }
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    catatanRef.current.forEach((x) => x.remove())
    catatanRef.current = []
    for (const c of catatan) {
      const el = document.createElement('div')
      el.title = `Dicatat: ${c.hasil}`
      el.style.cssText =
        `width:13px;height:13px;border-radius:50%;border:2px solid #fff;` +
        `background:${WARNA_HASIL[c.hasil] ?? '#64748b'};` +
        `box-shadow:0 1px 4px rgba(0,0,0,.4)`
      catatanRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([c.lon, c.lat])
          .addTo(m),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catatan, siap])

  // ---- pin yang sedang ditandai -------------------------------------------
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    if (!pin) {
      pinRef.current?.remove()
      pinRef.current = null
      return
    }
    if (!pinRef.current) {
      const el = document.createElement('div')
      el.innerHTML =
        `<svg width="26" height="26" viewBox="0 0 24 24" fill="#eab308" stroke="#fff" ` +
        `stroke-width="1.6" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))">` +
        `<path d="M12 22s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/>` +
        `<circle cx="12" cy="10.5" r="2.4" fill="#fff" stroke="none"/></svg>`
      // Jangkar 'bottom': ujung runcing pin menunjuk koordinatnya. Dengan
      // jangkar tengah, titik yang dicatat meleset setengah tinggi ikon ke
      // utara — pada zoom kapal itu ratusan meter.
      pinRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pin.lon, pin.lat])
        .addTo(m)
    } else {
      pinRef.current.setLngLat([pin.lon, pin.lat])
    }
  }, [pin, siap])

  // ---- posisi kapal -------------------------------------------------------
  useEffect(() => {
    const m = peta.current
    if (!m || !siap) return
    if (!posisiKapal) {
      kapalRef.current?.remove()
      kapalRef.current = null
      return
    }
    if (!kapalRef.current) {
      const el = document.createElement('div')
      el.style.cssText =
        'width:22px;height:22px;position:relative;display:flex;align-items:center;justify-content:center'
      el.innerHTML =
        `<span style="position:absolute;inset:-9px;border-radius:50%;background:rgba(46,49,146,.22)"></span>` +
        `<span data-arah style="width:0;height:0;border-left:7px solid transparent;` +
        `border-right:7px solid transparent;border-bottom:16px solid #2e3192;` +
        `filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));transform-origin:50% 65%"></span>`
      kapalRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([posisiKapal.lon, posisiKapal.lat])
        .addTo(m)
    } else {
      kapalRef.current.setLngLat([posisiKapal.lon, posisiKapal.lat])
    }
    const panah = kapalRef.current.getElement().querySelector('[data-arah]') as HTMLElement | null
    if (panah) panah.style.transform = `rotate(${arahKapal ?? 0}deg)`
    if (ikutiKapal) m.easeTo({ center: [posisiKapal.lon, posisiKapal.lat], duration: 600 })
  }, [posisiKapal, arahKapal, ikutiKapal, siap])

  // ---- fokus --------------------------------------------------------------
  useEffect(() => {
    const m = peta.current
    if (!m || !siap || !fokus) return
    if (Array.isArray(fokus)) {
      m.fitBounds(fokus, { padding: { top: 80, bottom: 300, left: 36, right: 36 }, duration: 800 })
    } else {
      m.easeTo({ center: [fokus.lon, fokus.lat], zoom: fokus.zoom ?? 9, duration: 800 })
    }
  }, [fokus, siap])

  return (
    <div className="absolute inset-0">
      <div ref={wadah} className="h-full w-full" />
      {galat && (
        <div className="box-cut pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 px-3 py-1.5 text-[10px] text-white"
          style={{ background: 'rgba(0,33,71,0.9)' }}>
          {galat}
        </div>
      )}
    </div>
  )
}
