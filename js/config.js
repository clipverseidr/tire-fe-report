/**
 * js/config.js - Konfigurasi Produksi TIRE FE REPORT
 * Tidak menyimpan credential/secret sensitif di client.
 */
window.APP_CONFIG = {
  APP_VERSION: '2.0.0-prod',
  TIMEZONE: 'Asia/Jakarta',
  // Gunakan 'APPS_SCRIPT' jika di-host via Google Apps Script HTML Service (google.script.run)
  // Gunakan 'FETCH_API' jika di-host via GitHub Pages / server eksternal
  TRANSPORT_MODE: (typeof google !== 'undefined' && google.script && google.script.run) ? 'APPS_SCRIPT' : 'FETCH_API',
  API_URL: '', // Isi URL Web App Apps Script (/exec) HANYA jika memakai GitHub Pages
  GOOGLE_CLIENT_ID: '', // Isi OAuth Client ID HANYA jika memakai GitHub Pages

  PHOTO_TARGETS_KB: {
    'SN Photo': { min: 150, max: 250, maxDim: 1280 },
    'Overall Photo': { min: 250, max: 400, maxDim: 1600 },
    'DEFAULT': { min: 150, max: 350, maxDim: 1400 }
  },

  MASTER_CATEGORIES: [
    'Site', 'Tire Size', 'Brand', 'Pattern', 'Spec', 'Position',
    'Hot/Cold', 'Condition', 'Valve Status', 'Remarks',
    'Removal Reason', 'Status', 'Repair Area', 'Material'
  ],

  DEFAULT_MASTER_OPTIONS: {
    'Site': ['PT. AMMAN - BATU HIJAU', 'PT. BUMI SUKSESINDO - TUJUH BUKIT', 'PT. PAMA - INDO', 'PT. SIS - ADMO'],
    'Tire Size': ['27.00R49', '33.00R51', '40.00R57', '46/90R57', '12.00R24', '23.5R25', '29.5R25'],
    'Brand': ['MAXAM', 'TECHKING', 'BRIDGESTONE', 'MICHELIN', 'GOODYEAR', 'SAILUN'],
    'Pattern': ['MS401', 'MS401 PRO', 'MS453 Pro', 'ETD2S', 'ETADT', 'VRLS', 'XDR2'],
    'Spec': ['E4', 'S1', 'S2', 'L4', 'L5', '2 Star', '3 Star'],
    'Position': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    'Hot/Cold': ['Hot', 'Cold'],
    'Condition': ['Good', 'Cut', 'Chipping', 'Chunking', 'Crack', 'Cut Separation', 'Impact', 'Bulging', 'Smooth'],
    'Valve Status': ['Cap Valve OK', 'No Cap Valve', 'Leaking Valve', 'Bent Valve', 'Damaged Core'],
    'Remarks': ['OK / Running', 'Backlog Repair', 'To Repair', 'To Remove', 'Monitoring'],
    'Removal Reason': ['Worn Out / Smooth', 'Sidewall Cut', 'Tread Cut Separation', 'Impact / Shock Burst', 'Bead Damage', 'Repair Failure', 'Rotation'],
    'Status': ['Scrap', 'Repairable', 'Retread', 'Spare / Ready', 'Claim Warranty'],
    'Repair Area': ['Tread', 'Shoulder', 'Sidewall', 'Bead', 'Innerliner'],
    'Material': ['Patch Radial', 'Gum Rubber', 'Cement / Solution', 'Valve Stem', 'O-Ring']
  }
};
