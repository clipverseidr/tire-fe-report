/**
 * js/components.js
 * Feature 1: Searchable & Creatable Dropdown Component
 * Feature 2: Date & Time Asia/Jakarta Formatter & Repair Hours Calculator
 * Feature 3: Camera Capture, Gallery Picker & Target-KB JPEG Compressor
 */

const DateTimeJakarta = (function() {
  // Mengambil waktu lokal saat ini dalam format YYYY-MM-DDTHH:mm untuk <input type="datetime-local">
  function nowInputLocal() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const hh = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hh}:${map.minute}`;
  }

  // Konversi YYYY-MM-DDTHH:mm -> DD/MM/YYYY HH.mm.00 tanpa menggeser timezone
  function toSheetFormat(dtLocalVal) {
    if (!dtLocalVal) return '';
    const m = String(dtLocalVal).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) throw new Error('Format tanggal & jam tidak valid: ' + dtLocalVal);
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}.${m[5]}.${m[6] || '00'}`;
  }

  function calculateRepairHours(startVal, finishVal) {
    if (!startVal || !finishVal) return '';
    const t1 = new Date(startVal).getTime();
    const t2 = new Date(finishVal).getTime();
    if (isNaN(t1) || isNaN(t2)) throw new Error('Tanggal mulai/selesai tidak valid.');
    if (t2 < t1) throw new Error('Date Finish tidak boleh lebih awal dari Date Start.');
    return Number(((t2 - t1) / 3600000).toFixed(2));
  }

  return { nowInputLocal, toSheetFormat, calculateRepairHours };
})();

/**
 * Komponen Dropdown Searchable & Creatable
 */
class SearchableCreatableDropdown {
  constructor(containerEl, opts) {
    this.container = containerEl;
    this.category = opts.category;
    this.fieldName = opts.fieldName || opts.category;
    this.required = Boolean(opts.required);
    this.placeholder = opts.placeholder || ('Pilih atau ketik ' + this.fieldName + '...');
    this.onChange = opts.onChange || function() {};
    this.selectedValue = '';
    this.isOpen = false;
    this.activeIndex = -1;
    this.render();
  }

  getOptions() {
    return window.MasterDataStore ? window.MasterDataStore.getActiveOptions(this.category) : [];
  }

  canAddNew() {
    if (!window.MasterDataStore) return true;
    return window.MasterDataStore.canCurrentUserAdd(this.category);
  }

  render() {
    this.container.classList.add('sc-dropdown-wrapper', 'position-relative');
    this.container.innerHTML = `
      <div class="input-group input-group-sm">
        <input type="text" class="form-control sc-input" placeholder="${this.placeholder}"
               autocomplete="off" ${this.required ? 'required' : ''} />
        <button type="button" class="btn btn-outline-secondary sc-clear d-none" title="Hapus">&times;</button>
        <button type="button" class="btn btn-outline-secondary sc-toggle" tabindex="-1">&#9662;</button>
      </div>
      <div class="sc-menu list-group position-absolute w-100 shadow-sm d-none"
           style="z-index: 1055; max-height: 220px; overflow-y: auto;"></div>
      <div class="sc-status small text-muted mt-1 d-none"></div>
    `;

    this.inputEl = this.container.querySelector('.sc-input');
    this.menuEl = this.container.querySelector('.sc-menu');
    this.clearBtn = this.container.querySelector('.sc-clear');
    this.toggleBtn = this.container.querySelector('.sc-toggle');
    this.statusEl = this.container.querySelector('.sc-status');

    this.bindEvents();
  }

  bindEvents() {
    const self = this;

    this.inputEl.addEventListener('focus', function() {
      self.openMenu();
    });

    this.inputEl.addEventListener('input', function() {
      self.selectedValue = self.inputEl.value.trim();
      self.clearBtn.classList.toggle('d-none', !self.inputEl.value);
      self.openMenu();
      self.onChange(self.selectedValue);
    });

    this.inputEl.addEventListener('keydown', function(e) {
      const items = self.menuEl.querySelectorAll('.list-group-item-action');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!self.isOpen) self.openMenu();
        self.activeIndex = Math.min(self.activeIndex + 1, items.length - 1);
        self.highlightItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        self.activeIndex = Math.max(self.activeIndex - 1, 0);
        self.highlightItem(items);
      } else if (e.key === 'Enter' && self.isOpen && self.activeIndex >= 0 && items[self.activeIndex]) {
        e.preventDefault();
        items[self.activeIndex].click();
      } else if (e.key === 'Escape') {
        self.closeMenu();
      }
    });

    this.toggleBtn.addEventListener('click', function() {
      if (self.isOpen) self.closeMenu();
      else {
        self.inputEl.focus();
        self.openMenu();
      }
    });

    this.clearBtn.addEventListener('click', function() {
      self.setValue('');
      self.inputEl.focus();
    });

    document.addEventListener('click', function(e) {
      if (!self.container.contains(e.target)) {
        self.closeMenu();
      }
    });
  }

  highlightItem(items) {
    items.forEach((el, i) => el.classList.toggle('active', i === this.activeIndex));
  }

  openMenu() {
    this.isOpen = true;
    this.activeIndex = -1;
    const rawQuery = this.inputEl.value.trim().replace(/\s+/g, ' ');
    const qLower = rawQuery.toLowerCase();
    const options = this.getOptions();

    const filtered = options.filter(opt => opt.toLowerCase().includes(qLower));
    const exactMatch = options.some(opt => opt.toLowerCase() === qLower);

    let html = '';
    filtered.forEach(opt => {
      html += `<button type="button" class="list-group-item list-group-item-action py-1 px-2 small" data-val="${this.escapeHtml(opt)}">${this.escapeHtml(opt)}</button>`;
    });

    if (rawQuery && !exactMatch) {
      if (this.canAddNew()) {
        html += `<button type="button" class="list-group-item list-group-item-action list-group-item-primary py-1 px-2 small fw-semibold" data-add-new="${this.escapeHtml(rawQuery)}">+ Add New ${this.escapeHtml(this.category)}: "${this.escapeHtml(rawQuery)}"</button>`;
      } else {
        html += `<div class="list-group-item py-1 px-2 small text-danger">Penambahan nilai baru untuk kategori ${this.escapeHtml(this.category)} dibatasi Admin.</div>`;
      }
    }

    if (!html) {
      html = `<div class="list-group-item py-1 px-2 small text-muted">Tidak ada pilihan cocok</div>`;
    }

    this.menuEl.innerHTML = html;
    this.menuEl.classList.remove('d-none');

    const self = this;
    this.menuEl.querySelectorAll('[data-val]').forEach(btn => {
      btn.addEventListener('click', function() {
        self.setValue(btn.getAttribute('data-val'));
        self.closeMenu();
      });
    });

    const addBtn = this.menuEl.querySelector('[data-add-new]');
    if (addBtn) {
      addBtn.addEventListener('click', async function() {
        const newVal = addBtn.getAttribute('data-add-new');
        await self.handleCreateNew(newVal);
      });
    }
  }

  async handleCreateNew(newVal) {
    try {
      this.setStatus('Menyimpan pilihan baru...', 'text-primary');
      const saved = await window.MasterDataStore.addNewOption(this.category, newVal);
      this.setValue(saved.value);
      this.closeMenu();
      this.setStatus(
        saved.status === 'Pending Approval'
          ? 'Tersimpan lokal (Menunggu Approval Admin).'
          : (navigator.onLine ? 'Tersimpan ke Master Data.' : 'Disimpan ke antrean offline.'),
        'text-success'
      );
      // Segarkan seluruh instance dropdown lain di halaman
      document.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { category: this.category } }));
    } catch (err) {
      this.setStatus(err.message, 'text-danger');
    }
  }

  setStatus(msg, cls) {
    this.statusEl.className = 'sc-status small mt-1 ' + cls;
    this.statusEl.textContent = msg;
    this.statusEl.classList.remove('d-none');
    setTimeout(() => this.statusEl.classList.add('d-none'), 3500);
  }

  closeMenu() {
    this.isOpen = false;
    this.menuEl.classList.add('d-none');
  }

  setValue(val) {
    this.selectedValue = String(val || '').trim();
    this.inputEl.value = this.selectedValue;
    this.clearBtn.classList.toggle('d-none', !this.selectedValue);
    this.onChange(this.selectedValue);
  }

  getValue() {
    return this.inputEl.value.trim().replace(/\s+/g, ' ');
  }

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }
}

/**
 * Komponen Foto: Take Photo (Camera) + Choose from Gallery + Kompresi JPEG Target KB
 */
class PhotoFieldWidget {
  constructor(containerEl, fieldName) {
    this.container = containerEl;
    this.fieldName = fieldName;
    this.photoState = null; // { base64Data, sizeKb, mimeType, status }
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="border rounded p-2 bg-white">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <label class="form-label small fw-semibold mb-0">${this.fieldName}</label>
          <span class="badge bg-secondary photo-status">Kosong</span>
        </div>
        <div class="d-flex gap-1 mb-1">
          <button type="button" class="btn btn-sm btn-outline-primary flex-fill btn-take-photo">Take Photo</button>
          <button type="button" class="btn btn-sm btn-outline-secondary flex-fill btn-gallery">Gallery</button>
        </div>
        <input type="file" accept="image/*" capture="environment" class="d-none input-camera" />
        <input type="file" accept="image/*" class="d-none input-gallery" />
        <div class="photo-preview-box d-none text-center mt-2">
          <img class="img-thumbnail mb-1 photo-img" style="max-height: 110px; object-fit: cover;" />
          <div class="small text-muted photo-meta mb-1"></div>
          <div class="d-flex gap-1 justify-content-center">
            <button type="button" class="btn btn-xs btn-outline-warning py-0 px-2 small btn-retake">Retake</button>
            <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2 small btn-remove">Remove</button>
          </div>
        </div>
      </div>
    `;

    this.camInput = this.container.querySelector('.input-camera');
    this.galInput = this.container.querySelector('.input-gallery');
    this.statusBadge = this.container.querySelector('.photo-status');
    this.previewBox = this.container.querySelector('.photo-preview-box');
    this.imgEl = this.container.querySelector('.photo-img');
    this.metaEl = this.container.querySelector('.photo-meta');

    this.container.querySelector('.btn-take-photo').addEventListener('click', () => this.camInput.click());
    this.container.querySelector('.btn-gallery').addEventListener('click', () => this.galInput.click());
    this.container.querySelector('.btn-retake').addEventListener('click', () => this.camInput.click());
    this.container.querySelector('.btn-remove').addEventListener('click', () => this.clear());

    const handleFile = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await this.processFile(file);
    };
    this.camInput.addEventListener('change', handleFile);
    this.galInput.addEventListener('change', handleFile);
  }

  async processFile(file) {
    this.statusBadge.textContent = 'Compressing...';
    this.statusBadge.className = 'badge bg-info text-dark photo-status';

    const targets = window.APP_CONFIG.PHOTO_TARGETS_KB[this.fieldName] || window.APP_CONFIG.PHOTO_TARGETS_KB.DEFAULT;
    const compressed = await PhotoFieldWidget.compressToTargetRange(file, targets.min, targets.max, targets.maxDim);

    this.photoState = {
      base64Data: compressed.dataUrl,
      sizeKb: compressed.sizeKb,
      mimeType: 'image/jpeg',
      status: 'Pending Upload'
    };

    this.imgEl.src = compressed.dataUrl;
    this.metaEl.textContent = `JPEG • ${compressed.sizeKb} KB (Target ${targets.min}-${targets.max} KB)`;
    this.statusBadge.textContent = 'Pending Upload';
    this.statusBadge.className = 'badge bg-warning text-dark photo-status';
    this.previewBox.classList.remove('d-none');
  }

  clear() {
    this.photoState = null;
    this.camInput.value = '';
    this.galInput.value = '';
    this.previewBox.classList.add('d-none');
    this.statusBadge.textContent = 'Kosong';
    this.statusBadge.className = 'badge bg-secondary photo-status';
  }

  getPhotoData() {
    return this.photoState;
  }

  static compressToTargetRange(file, minKb, maxKb, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // Iterasi kualitas JPEG agar masuk rentang target KB tanpa mengorbankan keterbacaan SN
          let quality = 0.86;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          let sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);

          while (sizeKb > maxKb && quality > 0.45) {
            quality -= 0.07;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
          }

          resolve({ dataUrl, sizeKb });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}
