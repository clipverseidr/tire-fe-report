/**
 * dashboard.js
 * Dashboard Operasional TIRE FE REPORT (KPI + Chart.js + Filter Site).
 */

const DashboardManager = (function() {
  let moduleChartInstance = null;
  let siteChartInstance = null;
  let latestFetchedRows = [];

  function getLatestRows() {
    return latestFetchedRows.slice();
  }

  async function populateFilterSiteSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;

    const allowedSites = window.AuthManager ? AuthManager.getAllowedSites() : ['ALL'];
    const master = (await DBManager.getMasterData()) || {};
    const masterSites = Array.isArray(master.sites) ? master.sites : [];

    let sites = masterSites.map(function(s) {
      return typeof s === 'string' ? s : (s.name || s.site || s.Site || '');
    }).filter(Boolean);

    if (allowedSites.indexOf('ALL') === -1) {
      sites = sites.filter(function(s) { return allowedSites.indexOf(s) !== -1; });
      if (!sites.length) sites = allowedSites.slice();
    }

    el.innerHTML = '<option value="">Semua Site Diizinkan</option>';
    sites.forEach(function(s) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      el.appendChild(opt);
    });
  }

  async function fetchModuleData(moduleName, siteFilter, searchText) {
    if (!navigator.onLine) {
      const localRecs = await DBManager.getRecordsByModule(moduleName);
      return localRecs
        .filter(function(r) {
          if (siteFilter && String(r.site || '') !== siteFilter) return false;
          if (!searchText) return true;
          return JSON.stringify(r.fields || {}).toLowerCase().includes(searchText.toLowerCase());
        })
        .map(function(r) {
          return Object.assign({
            UUID: r.uuid,
            Transaction_ID: r.transactionId,
            Sync_Status: r.syncStatus || 'LOCAL_ONLY'
          }, r.fields || {});
        });
    }

    const filters = {};
    if (siteFilter) filters.site = siteFilter;

    const res = await SyncManager.callApi('queryRecords', {
      moduleName: moduleName,
      page: 1,
      pageSize: 200,
      filters: filters,
      searchText: searchText || ''
    });

    const dataObj = res.data || {};
    return Array.isArray(dataObj.rows) ? dataObj.rows : (Array.isArray(dataObj.records) ? dataObj.records : []);
  }

  function renderCharts(countsByModule, countsBySite) {
    if (typeof Chart === 'undefined') return;

    const modCanvas = document.getElementById('chartByModule');
    if (modCanvas) {
      if (moduleChartInstance) moduleChartInstance.destroy();
      moduleChartInstance = new Chart(modCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: Object.keys(countsByModule),
          datasets: [{
            label: 'Jumlah Record',
            data: Object.values(countsByModule),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    const siteCanvas = document.getElementById('chartBySite');
    if (siteCanvas) {
      if (siteChartInstance) siteChartInstance.destroy();
      siteChartInstance = new Chart(siteCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(countsBySite),
          datasets: [{
            data: Object.values(countsBySite)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
  }

  async function refreshDashboard(options) {
    const opts = options || {};
    const siteFilter = opts.site || '';
    const searchText = opts.searchText || '';
    const selectedModule = opts.moduleName || 'ALL';

    const modulesToLoad = selectedModule === 'ALL'
      ? ['Daily Tire Check', 'Daily Tire Inspection', 'Daily Repair Tire']
      : [selectedModule];

    const countsByModule = {};
    const countsBySite = {};
    const combinedRows = [];

    for (let i = 0; i < modulesToLoad.length; i++) {
      const mName = modulesToLoad[i];
      try {
        const rows = await fetchModuleData(mName, siteFilter, searchText);
        countsByModule[mName] = rows.length;
        rows.forEach(function(row) {
          const sName = String(row['Site'] || row['Site '] || row.site || 'Unassigned').trim() || 'Unassigned';
          countsBySite[sName] = (countsBySite[sName] || 0) + 1;
          combinedRows.push(Object.assign({ _Module: mName }, row));
        });
      } catch (err) {
        console.warn('Gagal memuat data modul ' + mName + ':', err);
        countsByModule[mName] = 0;
      }
    }

    latestFetchedRows = combinedRows;

    const queueStats = await DBManager.getQueueStats();
    const setText = function(id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setText('kpiTotalRecords', combinedRows.length);
    setText('kpiPendingQueue', queueStats.pending);
    setText('kpiSyncedQueue', queueStats.synced);

    renderCharts(countsByModule, countsBySite);
    return combinedRows;
  }

  return {
    populateFilterSiteSelect: populateFilterSiteSelect,
    refreshDashboard: refreshDashboard,
    getLatestRows: getLatestRows
  };
})();