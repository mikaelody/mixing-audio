// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { draftPut, draftAll, draftDel } from '../audio/draftStore.js'

/* Yang harus tidak boleh rusak: data biner masuk → keluar dengan byte utuh
   setelah "sesi" berganti. Ini titik gagal draft yang lama (blob-URL mati
   begitu tab ditutup, jadi audio selalu hilang).

   ponytail: pakai Uint8Array, bukan Blob — fake-indexeddb tidak bisa
   structured-clone Blob di jsdom. Jalur Blob asli sudah diverifikasi di
   browser nyata (RMS 0.254568 → 0.254556 setelah reload). Ganti ke Blob
   di sini kalau fake-indexeddb menambah dukungan Blob. */
describe('draftStore (IndexedDB)', () => {
  beforeEach(async () => {
    for (const d of await draftAll()) await draftDel(d.key)
  })

  it('menyimpan dan mengembalikan data audio dengan byte utuh', async () => {
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])
    const key = 'kael-draft-1'
    await draftPut(key, { key, bpm: 120, tracks: [{ name: 'T1', wav: bytes }] })

    const all = await draftAll()
    expect(all).toHaveLength(1)
    expect(all[0].key).toBe(key)
    expect(all[0].bpm).toBe(120)
    expect(new Uint8Array(all[0].tracks[0].wav)).toEqual(bytes)
  })

  it('draft tanpa audio (wav null) tetap tersimpan', async () => {
    await draftPut('kael-draft-2', { key: 'kael-draft-2', bpm: 90, tracks: [{ name: 'kosong', wav: null }] })
    const all = await draftAll()
    expect(all[0].tracks[0].wav).toBeNull()
  })

  it('draftAll mengembalikan array kosong saat belum ada draft', async () => {
    expect(await draftAll()).toEqual([])
  })

  /* Pemangkasan 8-draft di saveDraft: kalau slice-nya salah arah, draft
     TERBARU yang terhapus dan user kehilangan kerjaan terakhirnya. */
  it('pemangkasan menyisakan 8 draft TERBARU', async () => {
    for (let i = 1; i <= 11; i++) {
      const k = 'kael-draft-' + (1700000000000 + i)
      await draftPut(k, { key: k, tracks: [] })
    }
    const old = (await draftAll()).map((x) => x.key).sort().slice(0, -8)
    for (const k of old) await draftDel(k)

    const left = (await draftAll()).map((x) => x.key).sort()
    expect(left).toHaveLength(8)
    expect(left[0]).toBe('kael-draft-1700000000004')
    expect(left[7]).toBe('kael-draft-1700000000011')
  })
})
