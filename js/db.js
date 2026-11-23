/**
 * db.js
 * Wrapper IndexedDB untuk TIRE FE REPORT (Offline-First Storage).
 */

const DBManager = (function() {
  const DB_NAME = 'TIRE_FE_REPORT_DB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise(function(resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('records_local')) {
          const recStore = db.createObjectStore('records_local', { keyPath: 'uuid' });
          recStore.createIndex('moduleName', 'moduleName', { unique: false });
          recStore.createIndex('transactionId', 'transactionId', { unique: true });
          recStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          recStore.createIndex('site', 'site', { unique: false });
        }

        if (!db.objectStoreNames.contains('photos_blob')) {
          const photoStore = db.createObjectStore('photos_blob', { keyPath: 'photoId' });
          photoStore.createIndex('recordUuid', 'recordUuid', { unique: false });
          photoStore.createIndex('uploaded', 'uploaded', { unique: false });
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'queueId' });
          queueStore.createIndex('recordUuid', 'recordUuid', { unique: false });
          queueStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains('master_data')) {
          db.createObjectStore('master_data', { keyPath: 'key' });
        }
      };

      request.onsuccess = function(event) {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = function(event) {
        reject(event.target.error || new Error('Gagal membuka IndexedDB.'));
      };
    });
  }

  function withStore(storeName, mode, callback) {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        try {
          result = callback(store);
        } catch (err) {
          reject(err);
          return;
        }

        tx.oncomplete = function() {
          resolve(result);
        };
        tx.onerror = function(e) {
          reject(e.target.error || new Error('Transaksi IndexedDB gagal pada ' + storeName));
        };
      });
    });
  }

  function requestToPromise(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  }

  async function saveMasterData(masterObj) {
    return withStore('master_data', 'readwrite', function(store) {
      store.put({
        key: 'LATEST_MASTER_DATA',
        data: masterObj || {},
        updatedAt: new Date().toISOString()
      });
    });
  }

  async function getMasterData() {
    return withStore('master_data', 'readonly', async function(store) {
      const item = await requestToPromise(store.get('LATEST_MASTER_DATA'));
      return item && item.data ? item.data : null;
    });
  }

  async function putLocalRecord(record) {
    return withStore('records_local', 'readwrite', function(store) {
      store.put(record);
    });
  }

  async function getLocalRecord(uuid) {
    return withStore('records_local', 'readonly', function(store) {
      return requestToPromise(store.get(uuid));
    });
  }

  async function getRecordsByModule(moduleName) {
    return withStore('records_local', 'readonly', async function(store) {
      const index = store.index('moduleName');
      const list = await requestToPromise(index.getAll(moduleName));
      return (list || []).sort(function(a, b) {
        return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
      });
    });
  }

  async function putPhoto(photoObj) {
    return withStore('photos_blob', 'readwrite', function(store) {
      store.put(photoObj);
    });
  }

  async function getPhotosByRecord(recordUuid) {
    return withStore('photos_blob', 'readonly', function(store) {
      const index = store.index('recordUuid');
      return requestToPromise(index.getAll(recordUuid));
    });
  }

  async function putSyncQueueItem(item) {
    return withStore('sync_queue', 'readwrite', function(store) {
      store.put(item);
    });
  }

  async function getPendingQueueItems() {
    return withStore('sync_queue', 'readonly', async function(store) {
      const all = await requestToPromise(store.getAll());
      return (all || []).filter(function(item) {
        return item.status === 'PENDING' || item.status === 'FAILED';
      }).sort(function(a, b) {
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });
    });
  }

  async function getQueueStats() {
    return withStore('sync_queue', 'readonly', async function(store) {
      const all = await requestToPromise(store.getAll());
      const list = all || [];
      return {
        total: list.length,
        pending: list.filter(function(i) { return i.status === 'PENDING' || i.status === 'FAILED'; }).length,
        synced: list.filter(function(i) { return i.status === 'SYNCED'; }).length
      };
    });
  }

  return {
    openDB: openDB,
    saveMasterData: saveMasterData,
    getMasterData: getMasterData,
    putLocalRecord: putLocalRecord,
    getLocalRecord: getLocalRecord,
    getRecordsByModule: getRecordsByModule,
    putPhoto: putPhoto,
    getPhotosByRecord: getPhotosByRecord,
    putSyncQueueItem: putSyncQueueItem,
    getPendingQueueItems: getPendingQueueItems,
    getQueueStats: getQueueStats
  };
})();