/**
 * exporter.js
 * Export data TIRE FE REPORT ke format Excel (.xlsx) dan PDF (.pdf).
 */

const ReportExporter = (function() {
  function checkExportPermission() {
    if (window.AuthManager && typeof AuthManager.hasPermission === 'function') {
      if (!AuthManager.hasPermission('canExport')) {
        throw new Error('Akses ditolak: Role Anda tidak memiliki izin export data (canExport).');
      }
    }
  }

  function sanitizeRowsForExport(rows) {
    return (rows || []).map(function(row) {
      const clean = {};
      Object.keys(row).forEach(function(key) {
        if (key === '_rowIndex') return;
        clean[key] = row[key] !== undefined && row[key] !== null ? row[key] : '';
      });
      return clean;
    });
  }

  function exportToExcel(rows, filePrefix) {
    checkExportPermission();

    if (typeof XLSX === 'undefined') {
      throw new Error('Library SheetJS (XLSX) belum termuat.');
    }

    const cleaned = sanitizeRowsForExport(rows);
    if (!cleaned.length) {
      throw new Error('Tidak ada data untuk di-export ke Excel.');
    }

    const worksheet = XLSX.utils.json_to_sheet(cleaned);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TireReport');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `${filePrefix || 'TIRE_FE_REPORT'}_${dateStamp}.xlsx`;
    XLSX.writeFile(workbook, filename);
    return filename;
  }

  function exportToPdf(rows, titleText) {
    checkExportPermission();

    const jsPdfLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!jsPdfLib) {
      throw new Error('Library jsPDF belum termuat.');
    }

    const cleaned = sanitizeRowsForExport(rows);
    if (!cleaned.length) {
      throw new Error('Tidak ada data untuk di-export ke PDF.');
    }

    const doc = new jsPdfLib({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const title = titleText || 'TIRE FE REPORT - Operational Summary';
    const generatedAt = new Date().toLocaleString('id-ID');

    doc.setFontSize(14);
    doc.text(title, 14, 14);
    doc.setFontSize(9);
    doc.text('Dicetak: ' + generatedAt + ' | Total baris: ' + cleaned.length, 14, 21);

    const headers = Object.keys(cleaned[0]).slice(0, 8);
    let y = 30;
    const colWidth = 268 / Math.max(headers.length, 1);

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    headers.forEach(function(h, idx) {
      doc.text(String(h).substring(0, 22), 14 + (idx * colWidth), y);
    });

    doc.setFont(undefined, 'normal');
    y += 6;

    for (let i = 0; i < cleaned.length; i++) {
      if (y > 190) {
        doc.addPage();
        y = 16;
      }
      const r = cleaned[i];
      headers.forEach(function(h, idx) {
        const valText = String(r[h] || '').substring(0, 22);
        doc.text(valText, 14 + (idx * colWidth), y);
      });
      y += 5;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `TIRE_FE_REPORT_${dateStamp}.pdf`;
    doc.save(filename);
    return filename;
  }

  return {
    exportToExcel: exportToExcel,
    exportToPdf: exportToPdf
  };
})();