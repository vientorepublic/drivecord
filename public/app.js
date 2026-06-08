'use strict';

const PAGE_SIZE = 20;
let files = [];
let currentPage = 1;
let totalFiles = 0;
let activeAbortCtrl = null;
let progressStartedAt = null;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadFiles();
  setupUploadZone();
});

// ── File list ─────────────────────────────────────────────────────────────────
async function loadFiles(page = currentPage) {
  currentPage = page;
  try {
    const res = await fetch(`/api/files?page=${page}&limit=${PAGE_SIZE}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    files = json.data;
    totalFiles = json.total;
    renderFiles();
    renderPagination();
  } catch (err) {
    showToast('Failed to load file list: ' + err.message, 'error');
  }
}

function renderFiles() {
  const el = document.getElementById('fileTable');
  if (!files.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon"><i class="fa-solid fa-folder-open"></i></div>
        <p>No files uploaded yet</p>
      </div>`;
    return;
  }

  const rows = files
    .map(
      (f) => `
    <tr>
      <td>
        <div class="file-name">
          ${fileIcon(f.originalFilename)}
          <button class="file-name-btn" onclick="openDetail('${esc(f.id)}')" title="View details">${esc(f.originalFilename)}</button>
          <span class="chip">${f.totalChunks} chunks</span>
        </div>
      </td>
      <td class="col-muted">${fmtBytes(f.originalSize)}</td>
      <td class="col-muted">${fmtDate(f.uploadedAt)}</td>
      <td>
        <div class="actions">
          <button class="btn btn-dl" onclick="startDownload('${esc(f.id)}','${esc(f.originalFilename)}')">
            <i class="fa-solid fa-download"></i> Download
          </button>
          <button class="btn btn-del" onclick="deleteFile('${esc(f.id)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`,
    )
    .join('');

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Filename</th><th>Size</th><th>Uploaded At</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPagination() {
  const el = document.getElementById('pagination');
  const totalPages = Math.ceil(totalFiles / PAGE_SIZE);
  if (totalPages <= 1) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = `
    <button class="btn-page" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <span class="page-info">${currentPage} / ${totalPages}</span>
    <button class="btn-page" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-right"></i>
    </button>`;
}

function changePage(delta) {
  const totalPages = Math.ceil(totalFiles / PAGE_SIZE);
  const next = currentPage + delta;
  if (next >= 1 && next <= totalPages) loadFiles(next);
}

// ── Upload ────────────────────────────────────────────────────────────────────
function setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) handleUpload(input.files[0]);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });
}

async function handleUpload(file) {
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
  if (file.size > MAX_SIZE) {
    showToast(`File size (${fmtBytes(file.size)}) exceeds the 2 GB limit`, 'error');
    return;
  }

  const fd = new FormData();
  fd.append('file', file);

  showOverlay('upload', file.name);
  setProgress(0, 1, 'Preparing upload...');

  activeAbortCtrl = new AbortController();
  const signal = activeAbortCtrl.signal;

  try {
    const res = await fetch('/api/files/upload', { method: 'POST', body: fd, signal });
    await readSSE(
      res,
      (ev) => {
        if (ev.type === 'start') setProgress(0, 1, 'Preparing upload...');
        if (ev.type === 'connecting') setProgress(0, 1, 'Connecting to Discord...');
        if (ev.type === 'splitting')
          setProgress(0, ev.total, `Splitting into ${ev.total} chunks...`);
        if (ev.type === 'progress')
          setProgress(ev.done, ev.total, `Uploading chunk ${ev.done}/${ev.total}`);
        if (ev.type === 'done') {
          hideOverlay();
          loadFiles(1);
          showToast(`${ev.file.originalFilename} uploaded successfully`, 'success');
        }
        if (ev.type === 'error' && !signal.aborted) {
          hideOverlay();
          showToast('Upload failed: ' + ev.message, 'error');
        }
      },
      signal,
    );
  } catch (err) {
    if (!signal.aborted) {
      hideOverlay();
      showToast('Upload error: ' + err.message, 'error');
    }
  } finally {
    activeAbortCtrl = null;
  }
}

// ── Download ──────────────────────────────────────────────────────────────────
async function startDownload(id, filename) {
  showOverlay('download', filename);
  setProgress(0, 1, 'Preparing download...');

  activeAbortCtrl = new AbortController();
  const signal = activeAbortCtrl.signal;

  try {
    const res = await fetch(`/api/files/${id}/download`, { method: 'POST', signal });
    await readSSE(
      res,
      (ev) => {
        if (ev.type === 'start') setProgress(0, 1, 'Preparing download...');
        if (ev.type === 'connecting') setProgress(0, 1, 'Connecting to Discord...');
        if (ev.type === 'progress')
          setProgress(ev.done, ev.total, `Downloading chunk ${ev.done}/${ev.total}`);
        if (ev.type === 'ready') {
          hideOverlay();
          const a = document.createElement('a');
          a.href = `/api/files/job/${ev.jobId}`;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast(`${filename} downloaded successfully`, 'success');
        }
        if (ev.type === 'error' && !signal.aborted) {
          hideOverlay();
          showToast('Download failed: ' + ev.message, 'error');
        }
      },
      signal,
    );
  } catch (err) {
    if (!signal.aborted) {
      hideOverlay();
      showToast('Download error: ' + err.message, 'error');
    }
  } finally {
    activeAbortCtrl = null;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
let pendingDeleteId = null;

function deleteFile(id) {
  const file = files.find((f) => f.id === id);
  if (!file) return;
  pendingDeleteId = id;
  document.getElementById('deleteFilename').textContent = file.originalFilename;
  document.getElementById('deleteOverlay').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteOverlay').classList.remove('show');
  pendingDeleteId = null;
}

async function confirmDelete(withDiscord) {
  const id = pendingDeleteId;
  if (!id) return;

  // Show loading state inside the modal while the request is in flight.
  const actions = document.querySelector('#deleteOverlay .confirm-actions');
  const originalHTML = actions.innerHTML;
  actions.innerHTML = `<span class="delete-loading"><i class="fa-solid fa-spinner fa-spin"></i> Deleting...</span>`;

  try {
    const url = `/api/files/${id}${withDiscord ? '?discord=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    closeDeleteModal();
    // Go to previous page if we just deleted the last item on this page
    const remaining = files.filter((f) => f.id !== id).length;
    const newPage = remaining === 0 && currentPage > 1 ? currentPage - 1 : currentPage;
    await loadFiles(newPage);
    showToast(withDiscord ? 'File and Discord chunks deleted' : 'File entry deleted', 'info');
  } catch (err) {
    // Restore buttons so the user can retry or cancel.
    actions.innerHTML = originalHTML;
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ── Detail modal ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  try {
    const res = await fetch(`/api/files/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const f = await res.json();

    document.getElementById('detailTitle').textContent = f.originalFilename;
    document.getElementById('detailHash').textContent = 'SHA-256: ' + f.originalHash;

    document.getElementById('detailMeta').innerHTML = [
      ['Size', fmtBytes(f.originalSize)],
      ['Chunks', `${f.totalChunks} (${fmtBytes(f.chunkSize)}/chunk)`],
      ['Uploaded At', fmtDate(f.uploadedAt)],
      ['Channel ID', f.channelId],
    ]
      .map(
        ([k, v]) =>
          `<span class="detail-meta-key">${k}</span><span class="detail-meta-val" title="${v}">${v}</span>`,
      )
      .join('');

    const sorted = [...f.chunks].sort((a, b) => a.index - b.index);
    document.getElementById('detailChunks').innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Filename</th><th>Size</th><th>Hash (SHA-256)</th></tr></thead>
        <tbody>${sorted
          .map(
            (c) => `<tr>
          <td class="chunk-idx">${c.index + 1}</td>
          <td>${esc(c.filename)}</td>
          <td>${fmtBytes(c.size)}</td>
          <td class="chunk-hash" title="${c.hash}">${c.hash}</td>
        </tr>`,
          )
          .join('')}</tbody>
      </table>`;

    document.getElementById('detailOverlay').classList.add('show');
  } catch (err) {
    showToast('Failed to load file details: ' + err.message, 'error');
  }
}

function closeDetailModal(e) {
  // If e is provided, only close when clicking the overlay background
  if (e && e.target !== document.getElementById('detailOverlay')) return;
  document.getElementById('detailOverlay').classList.remove('show');
}

// ── Cancel ────────────────────────────────────────────────────────────────────
function cancelOperation() {
  if (activeAbortCtrl) {
    activeAbortCtrl.abort();
    hideOverlay();
    showToast('Operation cancelled', 'info');
  }
}

// ── SSE reader ────────────────────────────────────────────────────────────────
async function readSSE(response, handler, signal) {
  const reader = response.body.getReader();
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        try {
          reader.cancel();
        } catch (_) {
          /* ignore */
        }
      },
      { once: true },
    );
  }
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            handler(JSON.parse(line.slice(6)));
          } catch {
            /* ignore malformed */
          }
        }
      }
    }
  } catch (err) {
    if (!signal?.aborted) throw err;
  }
}

// ── Progress overlay ──────────────────────────────────────────────────────────
function showOverlay(type, filename) {
  progressStartedAt = null;
  document.getElementById('modalIcon').innerHTML =
    type === 'upload'
      ? '<i class="fa-solid fa-cloud-arrow-up"></i>'
      : '<i class="fa-solid fa-cloud-arrow-down"></i>';
  document.getElementById('modalTitle').textContent =
    type === 'upload' ? 'Uploading...' : 'Downloading...';
  document.getElementById('modalFilename').textContent = filename;
  document.getElementById('progressFill').classList.add('indeterminate');
  document.getElementById('progressPct').textContent = '';
  document.getElementById('progressLabel').textContent = 'Connecting...';
  document.getElementById('overlay').classList.add('show');
}

function setProgress(done, total, baseLabel) {
  const fill = document.getElementById('progressFill');
  fill.classList.remove('indeterminate');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fill.style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct > 0 ? pct + '%' : '';

  if (progressStartedAt === null && done > 0) {
    progressStartedAt = Date.now();
  }

  let label = baseLabel;
  if (progressStartedAt !== null && done > 0 && done < total) {
    const elapsed = Date.now() - progressStartedAt;
    if (elapsed > 500) {
      const rate = done / elapsed; // chunks per ms
      const remaining = (total - done) / rate;
      label += '  \u00b7  Time remaining: ' + fmtDuration(remaining);
    }
  }

  document.getElementById('progressLabel').textContent = label;
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('progressFill').style.width = '0%';
}

// ── Toasts ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const wrap = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type] ?? 'fa-circle-info'}"></i>${esc(msg)}`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B';
  const k = 1024,
    u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

function fmtDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US') +
    '  ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtDuration(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `~${m}m ${rem}s` : `~${m}m`;
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    mp4: 'fa-film',
    mov: 'fa-film',
    avi: 'fa-film',
    mkv: 'fa-film',
    webm: 'fa-film',
    mp3: 'fa-music',
    wav: 'fa-music',
    flac: 'fa-music',
    ogg: 'fa-music',
    jpg: 'fa-image',
    jpeg: 'fa-image',
    png: 'fa-image',
    gif: 'fa-image',
    webp: 'fa-image',
    svg: 'fa-image',
    zip: 'fa-box-archive',
    rar: 'fa-box-archive',
    '7z': 'fa-box-archive',
    tar: 'fa-box-archive',
    gz: 'fa-box-archive',
    pdf: 'fa-file-pdf',
    doc: 'fa-file-word',
    docx: 'fa-file-word',
    txt: 'fa-file-lines',
    md: 'fa-file-lines',
    js: 'fa-code',
    ts: 'fa-code',
    py: 'fa-code',
    sh: 'fa-code',
    json: 'fa-code',
  };
  return `<i class="fa-solid ${map[ext] ?? 'fa-folder'} file-icon"></i>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
