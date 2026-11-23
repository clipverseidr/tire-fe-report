/**
 * js/sync.js - 5 Jalur Sinkronisasi Terpisah & Automatic Retry
 * 1. Master Data
 * 2. Photos (Sequential per record)
 * 3. Operational Records (Chunked per module)
 * 4. User Changes
 * 5. Audit Logs
 */
const SyncManager = (function() {
  const CHUNK_SIZE = 10;
  let isSyncing = false;

  function generateUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function generateTransactionId(prefix) {
    return (prefix || 'TRX') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function callApi(action, extraPayload) {
    const payload = Object.assign({ action: action }, extraPayload || {});

    // Prioritas 1: Google Apps Script HTML Service (google.script.run)
    if (window.APP_CONFIG.TRANSPORT_MODE === 'APPS_SCRIPT' && typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(res => {
            if (!res || !res.success) reject(new Error((res && res.error) || 'Gagal memproses di server.'));
            else resolve(res);
          })
          .withFailureHandler(err => reject(new Error(err.message || String(err))))
          .handleApiRequest(payload);
      });
    }

    // Prioritas 2: Cross-origin CORS JSON POST ke Web App URL
    const apiUrl = window.APP_CONFIG.API_URL;
    const idToken = window.AuthManager ? window.AuthManager.getIdToken() : '';
    if (!apiUrl) return Promise.reject(new Error('API_URL belum dikonfigurasi.'));
    payload.idToken = idToken;

    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(r => r.json()).then(json => {
      if (!json.success) throw new Error(json.error || 'Permintaan gagal.');
      return json;
    });
  }

  // Channel 1: Master Data Queue
  async function syncMasterChannel(onProgress) {
    const items = (await DBManager.txGetAll('syncQueueMaster')).filter(i => i.status !== 'SYNCED');
    let count = 0;
    for (const item of items) {
      if (onProgress) onProgress(`Sync Master Data: ${item.payload.category} - ${item.payload.value}...`);
      const res = await callApi('addMasterOption', item.payload);
      await DBManager.txDelete('syncQueueMaster', item.queueId);
      if (res.option) await DBManager.txPut('masterData', res.option);
      count++;
    }
    return count;
  }

  // Channel 2 & 3: Sequential Photo Upload lalu Chunked Operational Records
  async function syncRecordsAndPhotosChannel(onProgress) {
    const recQueue = (await DBManager.txGetAll('syncQueueRecords')).filter(i => i.status !== 'SYNCED');
    let syncedCount = 0;
    let failedCount = 0;
    const readyByModule = {};

    for (const qItem of recQueue) {
      const record = await DBManager.txGet('records', qItem.recordUuid);
      if (!record) {
        await DBManager.txDelete('syncQueueRecords', qItem.queueId);
        continue;
      }
      try {
        const photos = await DBManager.getPhotosByRecord(record.uuid);
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (p.uploaded && p.drivePath) {
            record.fields[p.fieldName] = p.drivePath;
            continue;
          }
          if (onProgress) onProgress(`Upload foto ${i + 1}/${photos.length} (${p.fieldName})...`);
          const upRes = await callApi('uploadPhoto', {
            moduleName: record.moduleName,
            recordUuid: record.uuid,
            fieldName: p.fieldName,
            siteName: record.fields['Site'],
            base64Data: p.base64Data,
            mimeType: p.mimeType
          });
          p.uploaded = true;
          p.drivePath = upRes.file.relativePath;
          await DBManager.txPut('photos', p);
          await DBManager.txDelete('syncQueuePhotos', p.photoId);
          record.fields[p.fieldName] = p.drivePath;
        }

        if (!readyByModule[record.moduleName]) readyByModule[record.moduleName] = [];
        readyByModule[record.moduleName].push({ qItem, record });
      } catch (err) {
        failedCount++;
        qItem.status = 'FAILED';
        qItem.attempts = (qItem.attempts || 0) + 1;
        qItem.lastError = err.message;
        await DBManager.txPut('syncQueueRecords', qItem);
      }
    }

    for (const modName of Object.keys(readyByModule)) {
      const entries = readyByModule[modName];
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        if (onProgress) onProgress(`Sync ${modName} (${chunk.length} record)...`);
        try {
          const res = await callApi('syncRecordsBatch', {
            moduleName: modName,
            records: chunk.map(e => e.record)
          });
          for (let j = 0; j < chunk.length; j++) {
            const rItem = res.results[j];
            if (rItem && rItem.success) {
              chunk[j].record.syncStatus = 'SYNCED';
              await DBManager.txPut('records', chunk[j].record);
              // Hapus dari antrean lokal HANYA setelah server mengonfirmasi sukses
              await DBManager.txDelete('syncQueueRecords', chunk[j].qItem.queueId);
              syncedCount++;
            } else {
              failedCount++;
            }
          }
        } catch (batchErr) {
          failedCount += chunk.length;
          for (const e of chunk) {
            e.qItem.status = 'FAILED';
            e.qItem.lastError = batchErr.message;
            await DBManager.txPut('syncQueueRecords', e.qItem);
          }
        }
      }
    }
    return { syncedCount, failedCount };
  }

  // Channel 4: User Changes
  async function syncUsersChannel() {
    const items = (await DBManager.txGetAll('syncQueueUsers')).filter(i => i.status !== 'SYNCED');
    for (const item of items) {
      await callApi('upsertUser', { user: item.payload });
      await DBManager.txDelete('syncQueueUsers', item.queueId);
    }
    return items.length;
  }

  // Channel 5: Audit Logs
  async function syncLogsChannel() {
    const items = (await DBManager.txGetAll('syncQueueLogs')).filter(i => i.status !== 'SYNCED');
    if (!items.length) return 0;
    await callApi('syncAuditLogs', { logs: items.map(i => i.payload) });
    for (const item of items) {
      await DBManager.txDelete('syncQueueLogs', item.queueId);
    }
    return items.length;
  }

  async function syncAllChannels(onProgress) {
    if (isSyncing) return { skipped: true, message: 'Sinkronisasi sedang berjalan...' };
    if (!navigator.onLine) return { offline: true, message: 'Mode Offline: Data tersimpan aman di IndexedDB.' };

    isSyncing = true;
    try {
      await syncMasterChannel(onProgress);
      const recRes = await syncRecordsAndPhotosChannel(onProgress);
      await syncUsersChannel();
      await syncLogsChannel();
      return {
        syncedCount: recRes.syncedCount,
        failedCount: recRes.failedCount,
        message: `Sinkronisasi selesai (${recRes.syncedCount} record berhasil, ${recRes.failedCount} gagal).`
      };
    } finally {
      isSyncing = false;
    }
  }

  return { generateUuid, generateTransactionId, callApi, syncAllChannels };
})();
