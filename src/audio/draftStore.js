/* Draft storage. localStorage tidak bisa dipakai: ia hanya menyimpan teks dan
   dibatasi ~5 MB, sedangkan satu draft berisi WAV Blob penuh per track.
   IndexedDB menyimpan Blob apa adanya dan bertahan setelah tab ditutup.

   Key disimpan DI DALAM record juga, supaya satu getAll() sudah cukup —
   tidak perlu panggil getAllKeys() terpisah.

   ponytail: satu object store, satu record per draft. Pecah per-track kalau
   draft tumbuh sampai ratusan MB dan simpan-parsial jadi perlu. */

const DB_NAME = 'kael-mixing';
const STORE = 'drafts';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function run(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
    });
}

export const draftPut = (key, value) => run('readwrite', (s) => s.put(value, key));
export const draftAll = () => run('readonly', (s) => s.getAll());
export const draftDel = (key) => run('readwrite', (s) => s.delete(key));
