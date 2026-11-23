/**
 * js/app.js - Menghubungkan Form 33/28/43 Kolom, Dropdown, Photo Widgets, RBAC & Auto-Sync
 */
window.MasterDataStore = (function() {
  let options = [];
  let settings = { ALLOW_USER_ADD: 'true', REQUIRE_ADMIN_APPROVAL: 'false', RESTRICTED_CATEGORIES: '' };
  let currentUser = null;
  let permissions = {};

  function init(serverData) {
    currentUser = serverData.user;
    permissions = serverData.permissions || {};
    options = serverData.masterOptions || [];
    settings = Object.assign(settings, serverData.masterSettings || {});
  }

  function getActiveOptions(category) {
    const cLow = category.toLowerCase();
    const fromServer = options
      .filter(o => o.category.toLowerCase() === cLow && o.status === 'Active')
      .map(o => o.value);
    const defaults = window.APP_CONFIG.DEFAULT_MASTER_OPTIONS[category] || [];
    const merged = Array.from(new Set([].concat(fromServer, defaults)));
    if (cLow === 'site' && currentUser && !currentUser.assignedSites.includes('ALL')) {
      return merged.filter(s => currentUser.assignedSites.some(a => a.toLowerCase() === s.toLowerCase()));
    }
    return merged;
  }

  function canCurrentUserAdd(category) {
    if (permissions.canManageMaster) return true;
    if (settings.ALLOW_USER_ADD !== 'true') return false;
    const restricted = String(settings.RESTRICTED_CATEGORIES || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return !restricted.includes(category.toLowerCase());
  }

  async function addNewOption(category, rawVal) {
    const value = String(rawVal || '').trim().replace(/\s+/g, ' ');
    const optObj = {
      optionId: 'OPT-LOCAL-' + Date.now(),
      category: category,
      value: value,
      status: (!permissions.canManageMaster && settings.REQUIRE_ADMIN_APPROVAL === 'true') ? 'Pending Approval' : 'Active',
      usageCount: 0
    };
    options.push(optObj);
    await DBManager.txPut('masterData', optObj);

    if (navigator.onLine) {
      const res = await SyncManager.callApi('addMasterOption', { category, value });
      if (res.option) {
        Object.assign(optObj, res.option);
        await DBManager.txPut('masterData', optObj);
      }
    } else {
      await DBManager.txPut('syncQueueMaster', {
        queueId: SyncManager.generateUuid(),
        status: 'PENDING',
        payload: { category, value }
      });
    }
    return optObj;
  }

  return {
    init, getActiveOptions, canCurrentUserAdd, addNewOption,
    getAllOptions: () => options,
    getSettings: () => settings,
    getUser: () => currentUser,
    getPermissions: () => permissions
  };
})();

(function() {
  const dropdowns = {};
  const photoWidgets = { check: {}, inspection: {}, repair: {} };

  const CHECK_PHOTOS = ['SN Photo', 'Overall Photo', 'Tread Photo', 'Shoulder Photo', 'Sidewall Photo', 'Bead Photo', 'Rim Photo', 'Valve Photo'];
  const INSP_PHOTOS = ['SN Photo', 'Overall Photo', 'Tread Photo', 'Shoulder Photo', 'Sidewall Photo', 'Bead Photo', 'Innerliner Photo', 'Other Photo'];

  function mountDropdown(key, elId, category, required) {
    const el = document.getElementById(elId);
    if (el) dropdowns[key] = new SearchableCreatableDropdown(el, { category, required });
  }

  function initWidgets() {
    // Daily Tire Check dropdowns
    mountDropdown('dtcSite', 'dtcSiteWrap', 'Site', true);
    mountDropdown('dtcSize', 'dtcSizeWrap', 'Tire Size', true);
    mountDropdown('dtcBrand', 'dtcBrandWrap', 'Brand', true);
    mountDropdown('dtcPattern', 'dtcPatternWrap', 'Pattern', false);
    mountDropdown('dtcSpec', 'dtcSpecWrap', 'Spec', false);
    mountDropdown('dtcPos', 'dtcPosWrap', 'Position', true);
    mountDropdown('dtcHotCold', 'dtcHotColdWrap', 'Hot/Cold', false);
    mountDropdown('dtcTread', 'dtcTreadWrap', 'Condition', false);
    mountDropdown('dtcShoulder', 'dtcShoulderWrap', 'Condition', false);
    mountDropdown('dtcSidewall', 'dtcSidewallWrap', 'Condition', false);
    mountDropdown('dtcBead', 'dtcBeadWrap', 'Condition', false);
    mountDropdown('dtcRim', 'dtcRimWrap', 'Condition', false);
    mountDropdown('dtcValve', 'dtcValveWrap', 'Valve Status', false);
    mountDropdown('dtcRemarks', 'dtcRemarksWrap', 'Remarks', false);

    // Daily Tire Inspection dropdowns
    mountDropdown('dtiSite', 'dtiSiteWrap', 'Site', true);
    mountDropdown('dtiSize', 'dtiSizeWrap', 'Tire Size', true);
    mountDropdown('dtiBrand', 'dtiBrandWrap', 'Brand', true);
    mountDropdown('dtiPattern', 'dtiPatternWrap', 'Pattern', false);
    mountDropdown('dtiSpec', 'dtiSpecWrap', 'Spec', false);
    mountDropdown('dtiPos', 'dtiPosWrap', 'Position', true);
    mountDropdown('dtiHotCold', 'dtiHotColdWrap', 'Hot/Cold', false);
    mountDropdown('dtiRemoval', 'dtiRemovalWrap', 'Removal Reason', true);
    mountDropdown('dtiStatus', 'dtiStatusWrap', 'Status', true);

    // Daily Repair Tire dropdowns
    mountDropdown('drtSite', 'drtSiteWrap', 'Site', true);
    mountDropdown('drtSize', 'drtSizeWrap', 'Tire Size', true);
    mountDropdown('drtBrand', 'drtBrandWrap', 'Brand', true);
    mountDropdown('drtPattern', 'drtPatternWrap', 'Pattern', false);
    mountDropdown('drtSpec', 'drtSpecWrap', 'Spec', false);
    mountDropdown('drtRemarks', 'drtRemarksWrap', 'Remarks', false);

    // Render 8 Foto Check
    const checkGrid = document.getElementById('dtcPhotoGrid');
    CHECK_PHOTOS.forEach(name => {
      const col = document.createElement('div');
      col.className = 'col-6 col-md-3';
      checkGrid.appendChild(col);
      photoWidgets.check[name] = new PhotoFieldWidget(col, name);
    });

    // Render 8 Foto Inspection
    const inspGrid = document.getElementById('dtiPhotoGrid');
    INSP_PHOTOS.forEach(name => {
      const col = document.createElement('div');
      col.className = 'col-6 col-md-3';
      inspGrid.appendChild(col);
      photoWidgets.inspection[name] = new PhotoFieldWidget(col, name);
    });

    // Render Repair Area 1, 2, 3 (masing-masing dengan Before, Brush Out, After Photo + dimensi A, R, D, S/C, Material)
    const areaContainer = document.getElementById('drtRepairAreasContainer');
    [1, 2, 3].forEach(idx => {
      const card = document.createElement('div');
      card.className = 'border rounded p-2 mb-2 bg-light';
      card.innerHTML = `
        <div class="fw-semibold small text-primary mb-2">Repair Area ${idx}</div>
        <div class="row g-2">
          <div class="col-md-3"><label class="form-label small">Repair Area ${idx}</label><div id="drtAreaWrap${idx}"></div></div>
          <div class="col-md-3"><label class="form-label small">Material ${idx}</label><div id="drtMatWrap${idx}"></div></div>
          <div class="col-md-1"><label class="form-label small">A ${idx}</label><input type="text" id="drtA${idx}" class="form-control form-control-sm" /></div>
          <div class="col-md-1"><label class="form-label small">R ${idx}</label><input type="text" id="drtR${idx}" class="form-control form-control-sm" /></div>
          <div class="col-md-2"><label class="form-label small">D ${idx}</label><input type="text" id="drtD${idx}" class="form-control form-control-sm" /></div>
          <div class="col-md-2"><label class="form-label small">S/C ${idx}</label><input type="text" id="drtSC${idx}" class="form-control form-control-sm" /></div>
          <div class="col-md-4" id="drtBeforePhoto${idx}"></div>
          <div class="col-md-4" id="drtBrushPhoto${idx}"></div>
          <div class="col-md-4" id="drtAfterPhoto${idx}"></div>
        </div>
      `;
      areaContainer.appendChild(card);
      mountDropdown(`drtArea${idx}`, `drtAreaWrap${idx}`, 'Repair Area', idx === 1);
      mountDropdown(`drtMat${idx}`, `drtMatWrap${idx}`, 'Material', false);

      photoWidgets.repair[`Before Photo ${idx}`] = new PhotoFieldWidget(document.getElementById(`drtBeforePhoto${idx}`), `Before Photo ${idx}`);
      photoWidgets.repair[`Brush Out Photo ${idx}`] = new PhotoFieldWidget(document.getElementById(`drtBrushPhoto${idx}`), `Brush Out Photo ${idx}`);
      photoWidgets.repair[`After Photo ${idx}`] = new PhotoFieldWidget(document.getElementById(`drtAfterPhoto${idx}`), `After Photo ${idx}`);
    });

    // Auto-hitung Repair Hours saat Date Start / Date Finish berubah
    const recalcHours = () => {
      const s = document.getElementById('drtDateStart').value;
      const f = document.getElementById('drtDateFinish').value;
      const out = document.getElementById('drtRepairHours');
      if (!s || !f) { out.value = ''; return; }
      try {
        out.value = DateTimeJakarta.calculateRepairHours(s, f);
      } catch (err) {
        out.value = '';
        alert(err.message);
      }
    };
    document.getElementById('drtDateStart').addEventListener('change', recalcHours);
    document.getElementById('drtDateFinish').addEventListener('change', recalcHours);
  }

  async function saveRecordOfflineFirst(moduleName, fields, widgetMap) {
    const uuid = SyncManager.generateUuid();
    const trxId = SyncManager.generateTransactionId(moduleName.replace(/[^A-Z]/g, ''));
    const nowStr = DateTimeJakarta.toSheetFormat(DateTimeJakarta.nowInputLocal());

    // Simpan foto ke IndexedDB terlebih dahulu
    for (const fieldName of Object.keys(widgetMap)) {
      const pData = widgetMap[fieldName].getPhotoData();
      if (pData && pData.base64Data) {
        const photoId = `${uuid}_${fieldName}`;
        await DBManager.txPut('photos', {
          photoId, recordUuid: uuid, fieldName,
          base64Data: pData.base64Data, sizeKb: pData.sizeKb,
          mimeType: pData.mimeType, uploaded: false
        });
        await DBManager.txPut('syncQueuePhotos', { queueId: photoId, recordUuid: uuid, status: 'PENDING' });
      }
    }

    const record = {
      uuid, transactionId: trxId, moduleName,
      fields, syncStatus: 'PENDING', createdAt: nowStr, updatedAt: nowStr, version: 1
    };
    await DBManager.txPut('records', record);
    await DBManager.txPut('syncQueueRecords', {
      queueId: uuid, recordUuid: uuid, moduleName, status: 'PENDING', attempts: 0
    });

    if (navigator.onLine) {
      return SyncManager.syncAllChannels();
    }
    return { offline: true, message: 'Tersimpan offline di IndexedDB. Akan otomatis sync saat online.' };
  }

  window.addEventListener('DOMContentLoaded', async function() {
    initWidgets();
    const nowDefault = DateTimeJakarta.nowInputLocal();
    ['dtcDate', 'dtiDate', 'drtDateStart', 'drtDateFinish'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = nowDefault;
    });

    // Submit Daily Tire Check (33 kolom)
    document.getElementById('formDailyTireCheck').addEventListener('submit', async function(e) {
      e.preventDefault();
      const fields = {
        'Date': DateTimeJakarta.toSheetFormat(document.getElementById('dtcDate').value),
        'Site': dropdowns.dtcSite.getValue(),
        'PIC': document.getElementById('dtcPic').value,
        'No. Unit': document.getElementById('dtcUnit').value.trim(),
        'HM': document.getElementById('dtcHm').value,
        'KM': document.getElementById('dtcKm').value,
        'Tire Size': dropdowns.dtcSize.getValue(),
        'Brand': dropdowns.dtcBrand.getValue(),
        'Pattern': dropdowns.dtcPattern.getValue(),
        'Spec': dropdowns.dtcSpec.getValue(),
        'Pos.': dropdowns.dtcPos.getValue(),
        'SN': document.getElementById('dtcSn').value.trim(),
        'RTD 1': document.getElementById('dtcRtd1').value,
        'RTD 2': document.getElementById('dtcRtd2').value,
        'Pressure': document.getElementById('dtcPressure').value,
        'Hot/Cold': dropdowns.dtcHotCold.getValue(),
        'Tire lifehours': document.getElementById('dtcLifehours').value,
        'Tread': dropdowns.dtcTread.getValue(),
        'Shoulder': dropdowns.dtcShoulder.getValue(),
        'Sidewall': dropdowns.dtcSidewall.getValue(),
        'Bead': dropdowns.dtcBead.getValue(),
        'Rim': dropdowns.dtcRim.getValue(),
        'Valve': dropdowns.dtcValve.getValue(),
        'Remarks': dropdowns.dtcRemarks.getValue()
      };
      const res = await saveRecordOfflineFirst('Daily Tire Check', fields, photoWidgets.check);
      alert(res.message);
    });

    // Submit Daily Tire Inspection (28 kolom)
    document.getElementById('formTireInspection').addEventListener('submit', async function(e) {
      e.preventDefault();
      const fields = {
        'Date': DateTimeJakarta.toSheetFormat(document.getElementById('dtiDate').value),
        'Site': dropdowns.dtiSite.getValue(),
        'PIC': document.getElementById('dtiPic').value,
        'No. Unit': document.getElementById('dtiUnit').value.trim(),
        'HM': document.getElementById('dtiHm').value,
        'KM': document.getElementById('dtiKm').value,
        'Tire Size': dropdowns.dtiSize.getValue(),
        'Brand': dropdowns.dtiBrand.getValue(),
        'Pattern': dropdowns.dtiPattern.getValue(),
        'Spec': dropdowns.dtiSpec.getValue(),
        'Pos.': dropdowns.dtiPos.getValue(),
        'SN': document.getElementById('dtiSn').value.trim(),
        'RTD 1': document.getElementById('dtiRtd1').value,
        'RTD 2': document.getElementById('dtiRtd2').value,
        'Pressure': document.getElementById('dtiPressure').value,
        'Hot/Cold': dropdowns.dtiHotCold.getValue(),
        'Tire lifehours': document.getElementById('dtiLifehours').value,
        'Removal Reason': dropdowns.dtiRemoval.getValue(),
        'Status': dropdowns.dtiStatus.getValue()
      };
      const res = await saveRecordOfflineFirst('Daily Tire Inspection', fields, photoWidgets.inspection);
      alert(res.message);
    });

    // Submit Daily Repair Tire (43 kolom)
    document.getElementById('formTireRepair').addEventListener('submit', async function(e) {
      e.preventDefault();
      const sVal = document.getElementById('drtDateStart').value;
      const fVal = document.getElementById('drtDateFinish').value;
      const repHours = DateTimeJakarta.calculateRepairHours(sVal, fVal);

      const fields = {
        'Site': dropdowns.drtSite.getValue(),
        'PIC': document.getElementById('drtPic').value,
        'Date Start': DateTimeJakarta.toSheetFormat(sVal),
        'Date Finish': DateTimeJakarta.toSheetFormat(fVal),
        'Tire Size': dropdowns.drtSize.getValue(),
        'Brand': dropdowns.drtBrand.getValue(),
        'Pattern': dropdowns.drtPattern.getValue(),
        'Spec': dropdowns.drtSpec.getValue(),
        'SN': document.getElementById('drtSn').value.trim(),
        'RTD 1': document.getElementById('drtRtd1').value,
        'RTD 2': document.getElementById('drtRtd2').value,
        'Tire Lifehours': document.getElementById('drtLifehours').value,
        'Last Hours': document.getElementById('drtLastHours').value,
        'Repair Hours': repHours,
        'Remarks': dropdowns.drtRemarks.getValue()
      };

      [1, 2, 3].forEach(idx => {
        fields[`Repair Area ${idx}`] = dropdowns[`drtArea${idx}`].getValue();
        fields[`Material ${idx}`] = dropdowns[`drtMat${idx}`].getValue();
        fields[`A ${idx}`] = document.getElementById(`drtA${idx}`).value.trim();
        fields[`R ${idx}`] = document.getElementById(`drtR${idx}`).value.trim();
        fields[`D ${idx}`] = document.getElementById(`drtD${idx}`).value.trim();
        fields[`S/C ${idx}`] = document.getElementById(`drtSC${idx}`).value.trim();
      });

      const res = await saveRecordOfflineFirst('Daily Repair Tire', fields, photoWidgets.repair);
      alert(res.message);
    });

    // Bootstrap Session dari Server
    try {
      const boot = await SyncManager.callApi('bootstrap');
      MasterDataStore.init(boot);
      document.getElementById('appWorkspace').classList.remove('d-none');
      document.getElementById('authUserInfo').textContent = `${boot.user.fullName} (${boot.user.role})`;
      ['dtcPic', 'dtiPic', 'drtPic'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = boot.user.fullName;
      });
    } catch (err) {
      const alertBox = document.getElementById('globalAlert');
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = err.message;
      alertBox.classList.remove('d-none');
    }
  });
})();
