/* Minimal front-end controller for the AI Live restream service. */

const $ = (id) => document.getElementById(id);
let uploadedFilename = null;

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

$('btnUpload').addEventListener('click', async () => {
  const file = $('fileInput').files[0];
  if (!file) return alert('เลือกไฟล์วิดีโอก่อน');

  const state = $('uploadState');
  state.textContent = 'กำลังอัปโหลด…';
  $('btnUpload').disabled = true;

  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/v1/video/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'อัปโหลดล้มเหลว');
    uploadedFilename = data.filename;
    state.textContent = `พร้อมแล้ว: ${data.originalName} (${(data.sizeBytes / 1e6).toFixed(1)} MB)`;
    $('btnStart').disabled = false;
  } catch (err) {
    state.textContent = 'ผิดพลาด: ' + err.message;
  } finally {
    $('btnUpload').disabled = false;
  }
});

$('btnStart').addEventListener('click', async () => {
  if (!uploadedFilename) return alert('อัปโหลดคลิปก่อน');
  const rtmpUrl = $('rtmpUrl').value.trim();
  const streamKey = $('streamKey').value.trim();
  if (!rtmpUrl || !streamKey) return alert('กรอก RTMP URL และ Stream Key');

  $('btnStart').disabled = true;
  try {
    await api('/api/v1/live/start', {
      filename: uploadedFilename,
      rtmpUrl,
      streamKey,
      title: $('title').value.trim(),
      loop: $('loop').checked,
    });
    await refresh();
  } catch (err) {
    alert('เริ่มไลฟ์ไม่สำเร็จ: ' + err.message);
  } finally {
    $('btnStart').disabled = false;
  }
});

async function stopSession(id) {
  try {
    await api('/api/v1/live/stop', { id });
    await refresh();
  } catch (err) {
    alert('หยุดไลฟ์ไม่สำเร็จ: ' + err.message);
  }
}

async function refresh() {
  try {
    const res = await fetch('/api/v1/live/status');
    const data = await res.json();
    const box = $('sessions');
    if (!data.sessions.length) {
      box.innerHTML = '<p class="hint">ยังไม่มีไลฟ์ที่กำลังทำงาน</p>';
      return;
    }
    box.innerHTML = data.sessions.map((s) => `
      <div class="session ${s.status}">
        <div>
          <b>${s.title}</b>
          <span class="badge ${s.status}">${s.status}</span>
          ${s.status === 'live' ? `<span class="uptime">${s.uptimeSec}s</span>` : ''}
          ${s.lastError ? `<div class="err">${s.lastError}</div>` : ''}
        </div>
        ${s.status === 'live' || s.status === 'stopping'
          ? `<button data-id="${s.id}" class="stop">หยุด</button>` : ''}
      </div>
    `).join('');
    box.querySelectorAll('button.stop').forEach((b) =>
      b.addEventListener('click', () => stopSession(b.dataset.id)));
  } catch (_) { /* ignore transient */ }
}

setInterval(refresh, 3000);
refresh();
