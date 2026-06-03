'use strict';

let files = [];

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadFiles();
  setupUploadZone();
});

// ── File list ─────────────────────────────────────────────────────────────────
async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    files = await res.json();
    renderFiles();
  } catch (err) {
    showToast('파일 목록 로드 실패: ' + err.message, 'error');
  }
}

function renderFiles() {
  const el = document.getElementById('fileTable');
  if (!files.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon"><i class="fa-solid fa-folder-open"></i></div>
        <p>업로드된 파일이 없습니다</p>
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
          <span class="file-name-text" title="${esc(f.originalFilename)}">${esc(f.originalFilename)}</span>
          <span class="chip">${f.totalChunks}청크</span>
        </div>
      </td>
      <td class="col-muted">${fmtBytes(f.originalSize)}</td>
      <td class="col-muted">${fmtDate(f.uploadedAt)}</td>
      <td>
        <div class="actions">
          <button class="btn btn-dl" onclick="startDownload('${esc(f.id)}','${esc(f.originalFilename)}')">
            <i class="fa-solid fa-download"></i> 다운로드
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
          <th>파일명</th><th>크기</th><th>업로드 일시</th><th>작업</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
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
  const fd = new FormData();
  fd.append('file', file);

  showOverlay('upload', file.name);
  setProgress(0, 1, 'Discord에 연결 중...');

  try {
    const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
    await readSSE(res, (ev) => {
      if (ev.type === 'start') setProgress(0, 1, 'Discord에 연결 중...');
      if (ev.type === 'progress')
        setProgress(ev.done, ev.total, `청크 업로드 중 ${ev.done}/${ev.total}`);
      if (ev.type === 'done') {
        hideOverlay();
        files.unshift(ev.file);
        renderFiles();
        showToast(`${ev.file.originalFilename} 업로드 완료`, 'success');
      }
      if (ev.type === 'error') {
        hideOverlay();
        showToast('업로드 실패: ' + ev.message, 'error');
      }
    });
  } catch (err) {
    hideOverlay();
    showToast('업로드 오류: ' + err.message, 'error');
  }
}

// ── Download ──────────────────────────────────────────────────────────────────
async function startDownload(id, filename) {
  showOverlay('download', filename);
  setProgress(0, 1, 'Discord에서 다운로드 중...');

  try {
    const res = await fetch(`/api/files/${id}/download`, { method: 'POST' });
    await readSSE(res, (ev) => {
      if (ev.type === 'progress')
        setProgress(ev.done, ev.total, `청크 다운로드 중 ${ev.done}/${ev.total}`);
      if (ev.type === 'ready') {
        hideOverlay();
        const a = document.createElement('a');
        a.href = `/api/files/job/${ev.jobId}`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`${filename} 다운로드 완료`, 'success');
      }
      if (ev.type === 'error') {
        hideOverlay();
        showToast('다운로드 실패: ' + ev.message, 'error');
      }
    });
  } catch (err) {
    hideOverlay();
    showToast('다운로드 오류: ' + err.message, 'error');
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
  closeDeleteModal();
  if (!id) return;

  try {
    const url = `/api/files/${id}${withDiscord ? '?discord=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    files = files.filter((f) => f.id !== id);
    renderFiles();
    showToast(
      withDiscord ? '파일 및 Discord 청크가 삭제되었습니다' : '파일 항목이 삭제되었습니다',
      'info',
    );
  } catch (err) {
    showToast('삭제 실패: ' + err.message, 'error');
  }
}

// ── SSE reader ────────────────────────────────────────────────────────────────
async function readSSE(response, handler) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
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
}

// ── Progress overlay ──────────────────────────────────────────────────────────
function showOverlay(type, filename) {
  document.getElementById('modalIcon').innerHTML =
    type === 'upload'
      ? '<i class="fa-solid fa-cloud-arrow-up"></i>'
      : '<i class="fa-solid fa-cloud-arrow-down"></i>';
  document.getElementById('modalTitle').textContent =
    type === 'upload' ? '업로드 중...' : '다운로드 중...';
  document.getElementById('modalFilename').textContent = filename;
  document.getElementById('progressFill').classList.add('indeterminate');
  document.getElementById('progressPct').textContent = '';
  document.getElementById('progressLabel').textContent = '연결 중...';
  document.getElementById('overlay').classList.add('show');
}

function setProgress(done, total, label) {
  const fill = document.getElementById('progressFill');
  fill.classList.remove('indeterminate');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fill.style.width = pct + '%';
  document.getElementById('progressLabel').textContent = label;
  document.getElementById('progressPct').textContent = pct > 0 ? pct + '%' : '';
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
    d.toLocaleDateString('ko-KR') +
    '  ' +
    d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  );
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
