/**
 * sync.js
 * Mesin Sinkronisasi Offline-First: Sequential Photo Upload & Chunked Record Sync.
 */

const SyncManager = (function() {
  const CHUNK_SIZE = 10;
  let isSyncing = false;

  function generateUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function generateTransactionId(prefix) {
    const p = prefix || 'TRX';
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return p + '-' + ts + '-' + rand;
  }

  async function callApi(action, extraPayload) {
    const apiUrl = window.APP_CONFIG && window.APP_CONFIG.API_URL;
    const idToken = window.AuthManager ? window.AuthManager.getIdToken() : '';

    if (!apiUrl) throw new Error('API_URL belum dikonfigurasi.');
    if (!idToken) throw new Error('Sesi login belum tersedia. Silakan login terlebih dahulu.');

    const payload = Object.assign({ action: action, idToken: idToken }, extraPayload || {});
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || ('Permintaan ' + action + ' gagal.'));
    }
    return json;
  }

  /**
   * Mengirim batch record sesuai nama modulnya.
   */
  async function sendBatchByModule(moduleName, recordsPayload) {
    if (moduleName === 'Daily Tire Check') {
      return callApi('syncDailyTireCheckBatch', {
        records: recordsPayload
      });
    }

    return callApi('syncTireModuleBatch', {
      moduleName: moduleName,
      records: recordsPayload
    });
  }

  /**
   * Mengelompokkan item siap kirim berdasarkan moduleName.
   */
  function groupItemsByModule(preparedItems) {
    const grouped = {};
    preparedItems.forEach(function(entry) {
      const modName = entry.record.moduleName || 'Daily Tire Check';
      if (!grouped[modName]) {
        grouped[modName] = [];
      }
      grouped[modName].push(entry);
    });
    return grouped;
  }

  /**
   * Mengunggah seluruh foto milik sebuah record secara berurutan (1 per 1).
   */
  async function uploadRecordPhotosSequentially(record, onProgress) {
    const photos = await DBManager.getPhotosByRecord(record.uuid);
    const uploadedUrls = {};

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      if (photo.uploaded && photo.driveUrl) {
        uploadedUrls[photo.fieldName] = photo.driveUrl;
        continue;
      }

      if (typeof onProgress === 'function') {
        onProgress(`Mengunggah foto ${i + 1}/${photos.length} (${photo.fieldName})...`);
      }

      const res = await callApi('uploadPhoto', {
        moduleName: record.moduleName,
        recordUuid: record.uuid,
        fieldName: photo.fieldName,
        siteName: record.site || '',
        recordDate: record.recordDate || '',
        base64Data: photo.base64Data,
        mimeType: photo.mimeType || 'image/jpeg'
      });

      const driveUrl = (res.file && (res.file.viewUrl || res.file.url || res.file.downloadUrl)) || '';
      photo.uploaded = true;
      photo.driveUrl = driveUrl;
      photo.uploadedAt = new Date().toISOString();
      await DBManager.putPhoto(photo);

      uploadedUrls[photo.fieldName] = driveUrl;
    }

    return uploadedUrls;
  }

  /**
   * Menjalankan sinkronisasi antrean tertunda secara berurutan & chunked.
   */
  async function syncPendingQueue(onProgress) {
    if (isSyncing) {
      return { skipped: true, message: 'Sinkronisasi sedang berjalan.' };
    }
    if (!navigator.onLine) {
      return { offline: true, message: 'Perangkat sedang offline. Data aman di penyimpanan lokal.' };
    }

    isSyncing = true;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const pendingQueue = await DBManager.getPendingQueueItems();
      if (!pendingQueue.length) {
        return { syncedCount: 0, failedCount: 0, message: 'Tidak ada antrean yang perlu disinkronkan.' };
      }

      const preparedItems = [];

      // Tahap 1: Sequential Photo Upload per record
      for (let i = 0; i < pendingQueue.length; i++) {
        const qItem = pendingQueue[i];
        const record = await DBManager.getLocalRecord(qItem.recordUuid);
        if (!record) {
          qItem.status = 'SYNCED';
          qItem.syncedAt = new Date().toISOString();
          await DBManager.putSyncQueueItem(qItem);
          continue;
        }

        try {
          record.syncStatus = 'UPLOADING_PHOTOS';
          await DBManager.putLocalRecord(record);

          const uploadedUrls = await uploadRecordPhotosSequentially(record, onProgress);

          record.fields = Object.assign({}, record.fields || {});
          Object.keys(uploadedUrls).forEach(function(fieldName) {
            record.fields[fieldName] = uploadedUrls[fieldName];
          });

          preparedItems.push({ queueItem: qItem, record: record });
        } catch (err) {
          failedCount++;
          qItem.status = 'FAILED';
          qItem.attempts = (qItem.attempts || 0) + 1;
          qItem.lastError = err.message || String(err);
          qItem.updatedAt = new Date().toISOString();
          await DBManager.putSyncQueueItem(qItem);

          record.syncStatus = 'FAILED';
          record.lastError = qItem.lastError;
          await DBManager.putLocalRecord(record);
        }
      }

      // Tahap 2: Chunked Record Sync per Modul ke Google Sheets
      const groupedByModule = groupItemsByModule(preparedItems);
      const moduleNames = Object.keys(groupedByModule);

      for (let m = 0; m < moduleNames.length; m++) {
        const modName = moduleNames[m];
        const modItems = groupedByModule[modName];

        for (let start = 0; start < modItems.length; start += CHUNK_SIZE) {
          const chunk = modItems.slice(start, start + CHUNK_SIZE);
          if (typeof onProgress === 'function') {
            onProgress(`Menyinkronkan ${modName} (batch ${Math.floor(start / CHUNK_SIZE) + 1})...`);
          }

          const recordsPayload = chunk.map(function(entry) {
            return {
              uuid: entry.record.uuid,
              transactionId: entry.record.transactionId,
              version: entry.record.version || 1,
              createdAt: entry.record.createdAt,
              updatedAt: entry.record.updatedAt,
              fields: entry.record.fields
            };
          });

          try {
            const batchRes = await sendBatchByModule(modName, recordsPayload);
            const results = batchRes.results || [];

            for (let j = 0; j < chunk.length; j++) {
              const entry = chunk[j];
              const rStatus = results[j];
              if (rStatus && rStatus.success === false) {
                throw new Error(rStatus.error || 'Gagal menyimpan record di server.');
              }

              entry.record.syncStatus = 'SYNCED';
              entry.record.syncedAt = new Date().toISOString();
              entry.record.lastError = '';
              await DBManager.putLocalRecord(entry.record);

              entry.queueItem.status = 'SYNCED';
              entry.queueItem.syncedAt = new Date().toISOString();
              entry.queueItem.lastError = '';
              await DBManager.putSyncQueueItem(entry.queueItem);

              syncedCount++;
            }
          } catch (batchErr) {
            for (let j = 0; j < chunk.length; j++) {
              const entry = chunk[j];
              failedCount++;
              entry.queueItem.status = 'FAILED';
              entry.queueItem.attempts = (entry.queueItem.attempts || 0) + 1;
              entry.queueItem.lastError = batchErr.message || String(batchErr);
              entry.queueItem.updatedAt = new Date().toISOString();
              await DBManager.putSyncQueueItem(entry.queueItem);

              entry.record.syncStatus = 'FAILED';
              entry.record.lastError = entry.queueItem.lastError;
              await DBManager.putLocalRecord(entry.record);
            }
          }
        }
      }

      return {
        syncedCount: syncedCount,
        failedCount: failedCount,
        message: `Sinkronisasi selesai: ${syncedCount} berhasil, ${failedCount} gagal.`
      };
    } finally {
      isSyncing = false;
    }
  }

  return {
    generateUuid: generateUuid,
    generateTransactionId: generateTransactionId,
    callApi: callApi,
    syncPendingQueue: syncPendingQueue
  };
})();