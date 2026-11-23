/**
 * js/db.js - IndexedDB Storage dengan 5 Store Sinkronisasi Terpisah
 */
const DBManager = (function() {
  const DB_NAME = 'TireFEReportProdDB';
  const DB_VERSION = 2;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        const stores = [
          { name: 'records', keyPath: 'uuid' },
          { name: 'photos', keyPath: 'photoId' },
          { name: 'masterData', keyPath: 'optionId' },
          { name: 'syncQueueRecords', keyPath: 'queueId' },
          { name: 'syncQueueMaster', keyPath: 'queueId' },
          { name: 'syncQueuePhotos', keyPath: 'queueId' },
          { name: 'syncQueueUsers', keyPath: 'queueId' },
          { name: 'syncQueueLogs', keyPath: 'queueId' }
        ];
        stores.forEach(function(s) {
          if (!db.objectStoreNames.contains(s.name)) {
            const store = db.createObjectStore(s.name, { keyPath: s.keyPath });
            if (s.name === 'photos') store.createIndex('recordUuid', 'recordUuid', { unique: false });
            if (s.name === 'masterData') store.createIndex('category', 'category', { unique: false });
          }
        });
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
    return dbPromise;
  }

  async function txPut(storeName, item) {
    const db = await openDb();
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = function() { resolve(item); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  }

  async function txDelete(storeName, key) {
    const db = await openDb();
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  }

  async function txGetAll(storeName) {
    const db = await openDb();
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }

  async function txGet(storeName, key) {
    const db = await openDb();
    return new Promise(function(resolve, reject) {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }

  async function getPhotosByRecord(recordUuid) {
    const all = await txGetAll('photos');
    return all.filter(p => p.recordUuid === recordUuid);
  }

  async function getQueueStats() {
    const [qRec, qMas, qPho, qUsr, qLog] = await Promise.all([
      txGetAll('syncQueueRecords'),
      txGetAll('syncQueueMaster'),
      txGetAll('syncQueuePhotos'),
      txGetAll('syncQueueUsers'),
      txGetAll('syncQueueLogs')
    ]);
    const all = [].concat(qRec, qMas, qPho, qUsr, qLog);
    const pending = all.filter(i => i.status === 'PENDING' || i.status === 'FAILED').length;
    const synced = all.filter(i => i.status === 'SYNCED').length;
    return {
      pending: pending,
      synced: synced,
      byChannel: {
        records: qRec.filter(i => i.status !== 'SYNCED').length,
        master: qMas.filter(i => i.status !== 'SYNCED').length,
        photos: qPho.filter(i => i.status !== 'SYNCED').length,
        users: qUsr.filter(i => i.status !== 'SYNCED').length,
        logs: qLog.filter(i => i.status !== 'SYNCED').length
      }
    };
  }

  return {
    txPut, txDelete, txGetAll, txGet,
    getPhotosByRecord,
    getQueueStats
  };
})();
