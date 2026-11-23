/**
 * dailyTireCheck.js
 * Modul UI & Logika Offline-First untuk "Daily Tire Check".
 */

const DailyTireCheckModule = (function() {
  const MODULE_NAME = 'Daily Tire Check';

  function compressImageToBase64(file, maxWidth, quality) {
    const targetWidth = maxWidth || 1280;
    const jpegQuality = quality || 0.75;

    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          let w = img.width;
          let h = img.height;
          if (w > targetWidth) {
            h = Math.round((h * targetWidth) / w);
            w = targetWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
          const base64Part = dataUrl.split(',')[1] || '';
          resolve({
            base64Data: base64Part,
            mimeType: 'image/jpeg',
            previewUrl: dataUrl
          });
        };
        img.onerror = function() { reject(new Error('Gagal membaca gambar foto.')); };
        img.src = e.target.result;
      };
      reader.onerror = function() { reject(new Error('Gagal memuat file foto.')); };
      reader.readAsDataURL(file);
    });
  }

  async function populateSiteOptions(selectElementId) {
    const selectEl = document.getElementById(selectElementId);
    if (!selectEl) return;

    const allowedSites = window.AuthManager ? AuthManager.getAllowedSites() : ['ALL'];
    const master = (await DBManager.getMasterData()) || {};
    const masterSites = Array.isArray(master.sites) ? master.sites : [];

    let options = masterSites.map(function(s) {
      return typeof s === 'string' ? s : (s.name || s.site || s.Site || '');
    }).filter(Boolean);

    if (allowedSites.indexOf('ALL') === -1) {
      options = options.filter(function(siteName) {
        return allowedSites.indexOf(siteName) !== -1;
      });
      if (!options.length) {
        options = allowedSites.slice();
      }
    }

    selectEl.innerHTML = '<option value="">-- Pilih Site --</option>';
    options.forEach(function(siteName) {
      const opt = document.createElement('option');
      opt.value = siteName;
      opt.textContent = siteName;
      selectEl.appendChild(opt);
    });
  }

  /**
   * Menyimpan submission form ke IndexedDB dan mendaftarkannya ke sync_queue.
   * @param {Object} formValues - Pasangan field sesuai header sheet Daily Tire Check
   * @param {Object} photoFiles - Map { fieldName: File }
   */
  async function submitDailyTireCheck(formValues, photoFiles, onStatus) {
    if (window.AuthManager && !AuthManager.hasPermission('canCreate')) {
      throw new Error('Role Anda tidak memiliki hak akses untuk membuat data Daily Tire Check.');
    }

    const uuid = SyncManager.generateUuid();
    const transactionId = SyncManager.generateTransactionId('DTC');
    const nowIso = new Date().toISOString();
    const siteVal = String(formValues['Site'] || '').trim();
    const dateVal = String(formValues['Date'] || nowIso.substring(0, 10)).trim();

    if (!siteVal) {
      throw new Error('Field Site wajib diisi.');
    }

    const record = {
      uuid: uuid,
      transactionId: transactionId,
      moduleName: MODULE_NAME,
      site: siteVal,
      recordDate: dateVal,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      syncStatus: 'PENDING_SYNC',
      fields: Object.assign({}, formValues)
    };

    // Simpan foto terkompresi ke photos_blob
    const filesMap = photoFiles || {};
    const photoFieldNames = Object.keys(filesMap);
    for (let i = 0; i < photoFieldNames.length; i++) {
      const fieldName = photoFieldNames[i];
      const file = filesMap[fieldName];
      if (!file) continue;

      if (typeof onStatus === 'function') {
        onStatus(`Mengompres foto ${fieldName} untuk penyimpanan offline...`);
      }

      const compressed = await compressImageToBase64(file, 1280, 0.75);
      await DBManager.putPhoto({
        photoId: uuid + '__' + fieldName,
        recordUuid: uuid,
        fieldName: fieldName,
        mimeType: compressed.mimeType,
        base64Data: compressed.base64Data,
        uploaded: false,
        driveUrl: '',
        createdAt: nowIso
      });
    }

    await DBManager.putLocalRecord(record);
    await DBManager.putSyncQueueItem({
      queueId: 'Q-' + uuid,
      recordUuid: uuid,
      transactionId: transactionId,
      moduleName: MODULE_NAME,
      status: 'PENDING',
      attempts: 0,
      lastError: '',
      createdAt: nowIso,
      updatedAt: nowIso
    });

    if (navigator.onLine) {
      if (typeof onStatus === 'function') {
        onStatus('Tersimpan lokal. Menyinkronkan ke server...');
      }
      const syncRes = await SyncManager.syncPendingQueue(onStatus);
      return { record: record, sync: syncRes };
    }

    return {
      record: record,
      sync: { offline: true, message: 'Tersimpan di perangkat (Offline). Akan otomatis tersinkron saat online.' }
    };
  }

  async function renderLocalTable(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const records = await DBManager.getRecordsByModule(MODULE_NAME);
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada data Daily Tire Check lokal.</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(function(r) {
      const f = r.fields || {};
      const badgeClass =
        r.syncStatus === 'SYNCED' ? 'bg-success' :
        r.syncStatus === 'FAILED' ? 'bg-danger' : 'bg-warning text-dark';

      return `
        <tr>
          <td>${escapeHtml(r.recordDate || '-')}</td>
          <td>${escapeHtml(r.site || '-')}</td>
          <td>${escapeHtml(f['Unit'] || f['Unit No'] || f['Code Tire'] || '-')}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(r.syncStatus || 'PENDING')}</span></td>
          <td><small class="text-monospace">${escapeHtml(r.transactionId)}</small></td>
        </tr>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    populateSiteOptions: populateSiteOptions,
    submitDailyTireCheck: submitDailyTireCheck,
    renderLocalTable: renderLocalTable
  };
})();