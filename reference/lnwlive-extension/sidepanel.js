/**
 * LnwLiveSHTIK - Side Panel Controller
 * ระบบควบคุมและจัดการการตลาดไลฟ์สด TikTok Live อัตโนมัติ (100% TikTok)
 */

import { api } from './js/api.js';
import { CookieManager } from './js/cookie-manager.js';
import { renderIcon } from './assets/icons.js';

// Application State
const state = {
  activeTab: 'tab-tiktok',
  selectedTikTokAccount: '',
  activeProfile: null,
  currentRoomId: '',
  autoPinQueue: [],
  isAutoPinRunning: false,
  currentPinIndex: 0,
  autoPinCountdownInterval: null,
  remainingSeconds: 0,
  overlayConfig: {
    font_family: 'digital7',
    date_x: 50.0,
    date_y: 15.0,
    time_x: 50.0,
    time_y: 25.0,
    time_font_color: 'yellow',
    time_bg: false
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  setupIcons();
  setupTabNavigation();
  setupEventListeners();
  setupDraggableOverlays();
  await loadAllData();
  await syncLiveStatus();
  setInterval(syncLiveStatus, 3000);
});

function setupIcons() {
  const logoEl = document.getElementById('spLogoImg');
  if (logoEl) logoEl.innerHTML = renderIcon('brand');

  document.getElementById('btnSidePanelRefresh').innerHTML = renderIcon('refresh');
  document.getElementById('btnSidePanelExpand').innerHTML = renderIcon('monitor');

  // Tabs
  document.getElementById('tabIconTikTok').innerHTML = renderIcon('tiktok');
  document.getElementById('tabIconPin').innerHTML = renderIcon('pin');
  document.getElementById('tabIconStudio').innerHTML = renderIcon('studio');
  document.getElementById('tabIconSettings').innerHTML = renderIcon('settings');

  // TikTok Icons
  document.getElementById('iconTikTokTitle').innerHTML = renderIcon('tiktok');
  document.getElementById('btnRefreshTikTokAccount').innerHTML = renderIcon('refresh');
  document.getElementById('iconTikTokCookiePill').innerHTML = renderIcon('cookie');
  document.getElementById('iconPlayTikTok').innerHTML = renderIcon('play');
  document.getElementById('iconStopTikTok').innerHTML = renderIcon('stop');
  document.getElementById('iconTikTokOptions').innerHTML = renderIcon('shield');

  // Auto-Pin Icons
  document.getElementById('iconAutoPinTitle').innerHTML = renderIcon('pin');
  document.getElementById('iconPlayPin').innerHTML = renderIcon('play');
  document.getElementById('iconStopPin').innerHTML = renderIcon('stop');

  // Studio Icons
  document.getElementById('iconStudioTitle').innerHTML = renderIcon('clock');

  // Settings Icons
  document.getElementById('iconSettingsConfig').innerHTML = renderIcon('settings');
  document.getElementById('iconSaveConfig').innerHTML = renderIcon('check');

  // Video Library Icons
  const btnRefVid = document.getElementById('btnRefreshServerVideos');
  if (btnRefVid) btnRefVid.innerHTML = renderIcon('refresh');
}

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      state.activeTab = btn.dataset.tab;
    });
  });
}

function setupEventListeners() {
  document.getElementById('btnSidePanelRefresh').addEventListener('click', loadAllData);
  document.getElementById('btnSidePanelExpand').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    } else {
      window.open('dashboard.html', '_blank');
    }
  });

  // Account Status & Refresh
  const btnRefreshAcc = document.getElementById('btnRefreshTikTokAccount');
  if (btnRefreshAcc) {
    btnRefreshAcc.addEventListener('click', async () => {
      btnRefreshAcc.disabled = true;
      try {
        await autoDetectAndSyncTikTokAccount(true);
        await syncLiveStatus();
        showAlert('ตรวจสอบและซิงค์เซสชันบัญชีสดสำเร็จ', 'info');
      } finally {
        btnRefreshAcc.disabled = false;
      }
    });
  }

  // TikTok Controls
  document.getElementById('btnGrabTikTokCookie').addEventListener('click', handleTikTokCookieGrab);
  document.getElementById('btnStartTikTokLive').addEventListener('click', handleStartTikTokLive);
  document.getElementById('btnStopTikTokLive').addEventListener('click', handleStopTikTokLive);
  document.getElementById('btnUpdateTikTokTitle').addEventListener('click', handleUpdateTikTokTitle);
  document.getElementById('chkTikTokAge').addEventListener('change', handleTikTokAgeToggle);
  document.getElementById('chkTikTokPromote').addEventListener('change', handleTikTokPromoteToggle);

  const btnWatchLive = document.getElementById('btnWatchTikTokLive');
  if (btnWatchLive) {
    btnWatchLive.addEventListener('click', () => {
      const handle = state.activeProfile?.uniqueId || 'ziopzz';
      const liveUrl = `https://www.tiktok.com/@${handle}/live`;
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url: liveUrl });
      } else {
        window.open(liveUrl, '_blank');
      }
    });
  }

  // Auto-Pin Controls
  document.getElementById('btnLookupProduct').addEventListener('click', handleLookupTikTokProduct);
  document.getElementById('btnClearPinQueue').addEventListener('click', () => {
    state.autoPinQueue = [];
    renderPinQueue();
  });
  document.getElementById('btnStartAutoPin').addEventListener('click', handleStartAutoPin);
  document.getElementById('btnStopAutoPin').addEventListener('click', handleStopAutoPin);

  // Settings Controls
  document.getElementById('btnSaveConfig').addEventListener('click', handleSaveConfig);

  // Server Video Library Controls
  const selServerVideos = document.getElementById('selServerVideos');
  if (selServerVideos) {
    selServerVideos.addEventListener('change', async (e) => {
      const filename = e.target.value;
      if (!filename) return;
      const opt = e.target.options[e.target.selectedIndex];
      const w = parseInt(opt?.dataset?.width || 720, 10);
      const h = parseInt(opt?.dataset?.height || 1280, 10);
      setStudioOrientation(h >= w, w, h);
      const config = await api.getConfig();
      const videoPlayer = document.getElementById('studioVideoPlayer');
      if (videoPlayer) {
        videoPlayer.src = `${config.baseUrl}/api/v1/video/stream/${encodeURIComponent(filename)}`;
        videoPlayer.load();
        videoPlayer.play().catch(() => {});
      }
    });
  }

  const btnRefVid = document.getElementById('btnRefreshServerVideos');
  if (btnRefVid) btnRefVid.addEventListener('click', loadServerVideos);

  const btnApplyVid = document.getElementById('btnApplyServerVideo');
  if (btnApplyVid) btnApplyVid.addEventListener('click', handleApplyServerVideo);

  // Studio Controls: Video Picker & Upload Progress Engine
  const btnPick = document.getElementById('btnPickStudioVideo');
  const fileInput = document.getElementById('studioVideoFileInput');
  if (btnPick && fileInput) {
    btnPick.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      btnPick.textContent = `กำลังโหลด ${file.name}...`;
      const videoPlayer = document.getElementById('studioVideoPlayer');
      if (videoPlayer) {
        const objectUrl = URL.createObjectURL(file);
        videoPlayer.src = objectUrl;
        videoPlayer.onloadedmetadata = () => {
          const w = videoPlayer.videoWidth;
          const h = videoPlayer.videoHeight;
          const isVertical = h >= w;
          setStudioOrientation(isVertical, w, h);
          videoPlayer.play().catch(() => { });
        };
      }

      // Progress bar UI
      const box = document.getElementById('uploadProgressBox');
      const bar = document.getElementById('uploadProgressBar');
      const pct = document.getElementById('uploadProgressPercent');
      const lbl = document.getElementById('uploadProgressLabel');
      const msg = document.getElementById('uploadStatusMessage');

      if (box) box.style.display = 'block';
      if (msg) msg.style.display = 'none';
      if (bar) {
        bar.style.width = '0%';
        bar.style.background = 'linear-gradient(90deg, var(--accent-cyan), #3b82f6)';
      }
      if (pct) pct.textContent = '0%';
      if (lbl) lbl.textContent = `กำลังอัปโหลด ${file.name}...`;
      btnPick.disabled = true;

      try {
        await api.uploadVideoWithProgress(
          state.selectedTikTokAccount || 'default',
          file,
          (percent, loaded, total) => {
            const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (total / (1024 * 1024)).toFixed(1);
            if (bar) bar.style.width = `${percent}%`;
            if (pct) pct.textContent = `${percent}% (${mbLoaded}/${mbTotal} MB)`;
            if (lbl) lbl.textContent = `กำลังอัปโหลด ${file.name} (${percent}%)...`;
          },
          true
        );

        if (bar) bar.style.width = '100%';
        if (pct) pct.textContent = '100%';
        if (lbl) lbl.textContent = `อัปโหลด ${file.name} เรียบร้อยแล้ว`;
        if (msg) {
          msg.style.display = 'block';
          msg.textContent = `อัปโหลดคลิปเสร็จสมบูรณ์ พร้อมนำไปไลฟ์สดได้ทันที (${file.name})`;
        }
        btnPick.textContent = `คลิป: ${file.name} (พร้อมไลฟ์)`;
        showAlert(`อัปโหลดคลิป ${file.name} สำเร็จและตั้งเป็นคลิปออกอากาศหลักแล้ว!`, 'info');
        await loadServerVideos();
      } catch (err) {
        if (lbl) lbl.textContent = `อัปโหลดล้มเหลว: ${err.message}`;
        if (bar) bar.style.background = '#ef4444';
        showAlert(`เกิดข้อผิดพลาดในการอัปโหลด: ${err.message}`, 'danger');
        btnPick.textContent = file.name;
      } finally {
        btnPick.disabled = false;
      }
    });
  }

  const btnMode916 = document.getElementById('btnMode916');
  if (btnMode916) {
    btnMode916.addEventListener('click', () => setStudioOrientation(true, 720, 1280));
  }

  const btnMode169 = document.getElementById('btnMode169');
  if (btnMode169) {
    btnMode169.addEventListener('click', () => setStudioOrientation(false, 1280, 720));
  }

  const btnSaveCoords = document.getElementById('btnSaveOverlayCoords');
  if (btnSaveCoords) {
    btnSaveCoords.addEventListener('click', async () => {
      btnSaveCoords.disabled = true;
      btnSaveCoords.textContent = 'กำลังบันทึก...';
      try {
        localStorage.setItem('lnwlive_overlay_config', JSON.stringify(state.overlayConfig));
        await api.saveOverlayConfig(state.selectedTikTokAccount || 'default', state.overlayConfig);
        showAlert(`บันทึกพิกัดและซิงค์เซิร์ฟเวอร์สำเร็จ! (Date: ${state.overlayConfig.date_x}%, ${state.overlayConfig.date_y}% | Time: ${state.overlayConfig.time_x}%, ${state.overlayConfig.time_y}%)`, 'info');
      } catch (err) {
        showAlert(`บันทึกลงเครื่องสำเร็จ แต่ซิงค์เซิร์ฟเวอร์ขัดข้อง: ${err.message}`, 'warning');
      } finally {
        btnSaveCoords.disabled = false;
        btnSaveCoords.textContent = 'บันทึกพิกัด';
      }
    });
  }

  const chkTimeBg = document.getElementById('chkTimeBg');
  if (chkTimeBg) {
    chkTimeBg.addEventListener('change', (e) => {
      const hasBg = e.target.checked;
      state.overlayConfig.time_bg = hasBg;
      const timeEl = document.getElementById('overlayTime');
      if (timeEl) {
        timeEl.style.background = hasBg ? '#000000' : 'none';
      }
    });
  }
}

// ==========================================
// 1. Studio Drag & Drop Engine & Orientation Detector
// ==========================================
function setupDraggableOverlays() {
  const canvas = document.getElementById('studioCanvas');
  const dateEl = document.getElementById('overlayDate');
  const timeEl = document.getElementById('overlayTime');

  if (canvas && dateEl) makeDraggable(dateEl, canvas, 'date');
  if (canvas && timeEl) makeDraggable(timeEl, canvas, 'time');

  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
  const now = new Date();
  const dateEl = document.getElementById('overlayDate');
  const timeEl = document.getElementById('overlayTime');
  if (dateEl) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateEl.textContent = `${yyyy}-${mm}-${dd}`;
  }
  if (timeEl) {
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${hh}:${min}:${ss}`;
  }
}

function makeDraggable(elmnt, canvas, key) {
  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  elmnt.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    elmnt.classList.add('dragging');
    elmnt.setPointerCapture(e.pointerId);

    startX = e.clientX;
    startY = e.clientY;

    const elmRect = elmnt.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    initialLeft = elmRect.left - canvasRect.left;
    initialTop = elmRect.top - canvasRect.top;

    elmnt.style.transform = 'none';
    elmnt.style.left = `${initialLeft}px`;
    elmnt.style.top = `${initialTop}px`;

    const onPointerMove = (moveEvt) => {
      if (!isDragging) return;
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      const elmWidth = elmnt.offsetWidth;
      const elmHeight = elmnt.offsetHeight;

      const newLeft = Math.max(0, Math.min(initialLeft + dx, canvasWidth - elmWidth));
      const newTop = Math.max(0, Math.min(initialTop + dy, canvasHeight - elmHeight));

      elmnt.style.left = `${newLeft}px`;
      elmnt.style.top = `${newTop}px`;

      const pctX = ((newLeft / (canvasWidth - elmWidth || 1)) * 100).toFixed(1);
      const pctY = ((newTop / (canvasHeight - elmHeight || 1)) * 100).toFixed(1);

      if (key === 'date') {
        state.overlayConfig.date_x = parseFloat(pctX);
        state.overlayConfig.date_y = parseFloat(pctY);
      } else {
        state.overlayConfig.time_x = parseFloat(pctX);
        state.overlayConfig.time_y = parseFloat(pctY);
      }
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      elmnt.classList.remove('dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

function setStudioOrientation(isVertical, width = 720, height = 1280) {
  const canvas = document.getElementById('studioCanvas');
  const badge = document.getElementById('videoOrientationBadge');
  const resText = document.getElementById('txtVideoResolution');
  const btn916 = document.getElementById('btnMode916');
  const btn169 = document.getElementById('btnMode169');

  if (!canvas) return;

  state.overlayConfig.is_vertical = isVertical;
  state.overlayConfig.aspect_ratio = isVertical ? '9:16' : '16:9';
  state.overlayConfig.width = width;
  state.overlayConfig.height = height;

  if (isVertical) {
    canvas.classList.remove('mode-169');
    canvas.classList.add('mode-916');
    if (badge) {
      badge.className = 'badge badge-live';
      badge.textContent = 'แนวตั้ง (9:16)';
      badge.style.background = '';
    }
    if (resText) resText.textContent = `${width}x${height} (9:16)`;
    if (btn916) {
      btn916.className = 'btn btn-primary btn-sm';
      btn916.style.fontSize = '10px';
      btn916.style.padding = '3px 8px';
    }
    if (btn169) {
      btn169.className = 'btn btn-secondary btn-sm';
      btn169.style.fontSize = '10px';
      btn169.style.padding = '3px 8px';
    }
  } else {
    canvas.classList.remove('mode-916');
    canvas.classList.add('mode-169');
    if (badge) {
      badge.className = 'badge badge-live';
      badge.style.background = '#8b5cf6';
      badge.textContent = 'แนวนอน (16:9)';
    }
    if (resText) resText.textContent = `${width}x${height} (16:9)`;
    if (btn169) {
      btn169.className = 'btn btn-primary btn-sm';
      btn169.style.fontSize = '10px';
      btn169.style.padding = '3px 8px';
    }
    if (btn916) {
      btn916.className = 'btn btn-secondary btn-sm';
      btn916.style.fontSize = '10px';
      btn916.style.padding = '3px 8px';
    }
  }

  try {
    localStorage.setItem('lnwlive_overlay_config', JSON.stringify(state.overlayConfig));
    if (api && api.saveOverlayConfig) {
      api.saveOverlayConfig({
        user_id: state.selectedTikTokAccount || 'default',
        ...state.overlayConfig
      }).catch(() => {});
    }
  } catch (_) { }
}

// ==========================================
// 2. Data Loading & Live Syncing
// ==========================================
async function loadAllData() {
  const config = await api.getConfig();
  const baseUrlEl = document.getElementById('cfgBaseUrl');
  if (baseUrlEl) {
    baseUrlEl.value = config.baseUrl;
  }

  try {
    await loadTikTokAccounts();
    await loadServerVideos();
  } catch (err) {
    showAlert(`เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว: ${err.message}`, 'danger');
  }
}

async function autoDetectAndSyncTikTokAccount(forceRefresh = false) {
  const lblName = document.getElementById('lblTikTokDisplayName');
  const txtHandle = document.getElementById('txtTikTokHandle');
  const txtUid = document.getElementById('txtTikTokUid');
  const badgeStatus = document.getElementById('badgeAccountStatus');
  const imgAvatar = document.getElementById('imgTikTokAvatar');
  const lblCookie = document.getElementById('lblTikTokCookieStatus');
  const hiddenSel = document.getElementById('selTikTokAccount');

  try {
    // 1. Try to extract live browser cookies from tiktok.com
    const extraction = await CookieManager.extractTikTokCookies();
    if (extraction && extraction.success) {
      // Direct live profile resolution from TikTok API / Tab
      const profile = await CookieManager.fetchTikTokProfile(extraction.cookie);
      const finalUserId = profile.userId || extraction.userId || '6570918575866413058';
      const displayName = profile.displayName || (profile.nickname ? `${profile.nickname} (@${profile.uniqueId})` : `TikTok Account (${finalUserId})`);

      // Store in memory state
      state.selectedTikTokAccount = finalUserId;
      state.activeProfile = {
        userId: finalUserId,
        nickname: profile.nickname || "enemy's nightmare💀",
        uniqueId: profile.uniqueId || 'ziopzz',
        avatar: profile.avatar || '',
        displayName
      };

      // Auto-sync with VPS backend database
      try {
        await api.addTikTokAccount(extraction.cookie, displayName, finalUserId);
      } catch (_) {}

      // Update UI elements
      if (lblName) lblName.textContent = profile.nickname || displayName;
      if (txtHandle) txtHandle.textContent = `@${profile.uniqueId || 'ziopzz'}`;
      if (txtUid) txtUid.textContent = `UID: ${finalUserId}`;
      if (imgAvatar && profile.avatar) imgAvatar.src = profile.avatar;
      if (badgeStatus) {
        badgeStatus.className = 'badge badge-live';
        badgeStatus.textContent = 'ออนไลน์ (ซิงค์แล้ว)';
      }
      if (lblCookie) lblCookie.textContent = `เซสชันบัญชี @${profile.uniqueId || 'ziopzz'} เชื่อมต่อพร้อมใช้งาน`;
      if (hiddenSel) hiddenSel.value = finalUserId;
      return;
    }

    // 2. Fallback to existing server profile if browser cookies are not yet in scope
    const res = await api.getTikTokAccounts();
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      const acc = res.data[0];
      const name = (acc.accountName || acc.displayName || acc.username || '').trim();
      const matchHandle = name.match(/@([a-zA-Z0-9_.-]+)/);
      const handle = matchHandle ? matchHandle[1] : 'ziopzz';
      const cleanNick = name.replace(/\s*\(@[a-zA-Z0-9_.-]+\)/, '').trim() || name;

      state.selectedTikTokAccount = acc.id;
      state.activeProfile = {
        userId: acc.id,
        nickname: cleanNick,
        uniqueId: handle,
        displayName: name
      };

      if (lblName) lblName.textContent = cleanNick;
      if (txtHandle) txtHandle.textContent = `@${handle}`;
      if (txtUid) txtUid.textContent = `UID: ${acc.id}`;
      if (badgeStatus) {
        badgeStatus.className = 'badge badge-live';
        badgeStatus.textContent = 'บัญชีเซิร์ฟเวอร์';
      }
      if (lblCookie) lblCookie.textContent = `เซสชันบัญชี @${handle} พร้อมใช้งาน`;
      if (hiddenSel) hiddenSel.value = acc.id;
      return;
    }

    // 3. No account found
    state.selectedTikTokAccount = '';
    state.activeProfile = null;
    if (lblName) lblName.textContent = 'ยังไม่ได้เข้าสู่ระบบ TikTok';
    if (txtHandle) txtHandle.textContent = '@ไม่มีเซสชัน';
    if (txtUid) txtUid.textContent = 'UID: -';
    if (badgeStatus) {
      badgeStatus.className = 'badge badge-offline';
      badgeStatus.textContent = 'ออฟไลน์';
    }
    if (lblCookie) lblCookie.textContent = 'กรุณาเปิด tiktok.com แล้วล็อกอินบัญชีของท่าน';
    if (hiddenSel) hiddenSel.value = '';
  } catch (err) {
    console.error('ตรวจสอบบัญชี TikTok ล้มเหลว:', err);
    if (lblCookie) lblCookie.textContent = 'ตรวจพบล้มเหลว: ' + err.message;
  }
}

async function loadTikTokAccounts() {
  await autoDetectAndSyncTikTokAccount();
}

async function syncLiveStatus() {
  if (!state.selectedTikTokAccount) return;
  try {
    const res = await api.getTikTokLiveStatus(state.selectedTikTokAccount);
    const indicator = document.getElementById('tiktokLiveIndicator');
    const viewersEl = document.getElementById('spTikTokViewers');
    const btnStart = document.getElementById('btnStartTikTokLive');
    const btnStop = document.getElementById('btnStopTikTokLive');
    const isLive = !!(res && (res.is_live || (Array.isArray(res.sessions) && res.sessions.length > 0)));

    if (res?.room_id) {
      state.currentRoomId = res.room_id;
    } else if (res?.sessions?.[0]?.room_id) {
      state.currentRoomId = res.sessions[0].room_id;
    }

    if (indicator) {
      indicator.className = isLive ? 'badge badge-live' : 'badge badge-offline';
      indicator.textContent = isLive ? (state.currentRoomId ? `กำลังไลฟ์สด (ห้อง: ${state.currentRoomId})` : 'กำลังไลฟ์สด') : 'พร้อมทำงาน (ออฟไลน์)';
    }

    // Dynamic real-time viewer count (no hardcoded fallback)
    const actualViewers = (typeof res?.viewer_count === 'number')
      ? res.viewer_count
      : ((typeof res?.sessions?.[0]?.viewer_count === 'number') ? res.sessions[0].viewer_count : 0);
    if (viewersEl) {
      viewersEl.textContent = isLive ? actualViewers : '0';
    }

    // Rapid real-time DOM sync if TikTok live tab is active
    if (isLive && typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        chrome.tabs.query({ url: '*://*.tiktok.com/*' }, (tabs) => {
          for (const tab of tabs || []) {
            if (tab.url?.includes('/live')) {
              chrome.tabs.sendMessage(tab.id, { action: 'GET_LIVE_VIEWERS' }, (r) => {
                if (r && typeof r.count === 'number' && r.count >= 0) {
                  if (viewersEl) viewersEl.textContent = r.count;
                }
              });
              break;
            }
          }
        });
      } catch (_) { }
    }

    // Dynamic Live Button Display:
    // If not live -> show Start Live button ONLY
    // If live -> show Stop Live button ONLY
    if (btnStart && btnStop) {
      if (isLive) {
        btnStart.style.display = 'none';
        btnStop.style.display = 'block';
        btnStop.style.width = '100%';
      } else {
        btnStart.style.display = 'block';
        btnStart.style.width = '100%';
        btnStop.style.display = 'none';
      }
    }
  } catch (_) { }
}

async function loadServerVideos() {
  const sel = document.getElementById('selServerVideos');
  if (!sel) return;

  try {
    const list = await api.listUserVideos(state.selectedTikTokAccount || 'default');
    sel.innerHTML = '';
    if (Array.isArray(list) && list.length > 0) {
      list.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.filename;
        opt.dataset.filepath = v.filepath || '';
        opt.dataset.width = v.width || 720;
        opt.dataset.height = v.height || 1280;
        opt.dataset.aspect = v.aspect_ratio || '9:16';
        const activeLabel = v.is_active ? ' [กำลังใช้งาน]' : '';
        opt.textContent = `${v.filename} (${v.width}x${v.height})${activeLabel}`;
        sel.appendChild(opt);
      });
      const activeOpt = Array.from(sel.options).find(o => o.textContent.includes('[กำลังใช้งาน]')) || sel.options[0];
      if (activeOpt) {
        activeOpt.selected = true;
        const config = await api.getConfig();
        const videoPlayer = document.getElementById('studioVideoPlayer');
        if (videoPlayer && !videoPlayer.src) {
          const w = parseInt(activeOpt.dataset.width || 720, 10);
          const h = parseInt(activeOpt.dataset.height || 1280, 10);
          setStudioOrientation(h >= w, w, h);
          videoPlayer.src = `${config.baseUrl}/api/v1/video/stream/${encodeURIComponent(activeOpt.value)}`;
          videoPlayer.load();
          videoPlayer.play().catch(() => {});
        }
      }
    } else {
      sel.innerHTML = '<option value="">-- ไม่พบคลิปบนเซิร์ฟเวอร์ กรุณาอัปโหลดคลิปใหม่ --</option>';
    }
  } catch (err) {
    console.error('โหลดรายการคลิปบนเซิร์ฟเวอร์ล้มเหลว:', err);
  }
}

async function handleApplyServerVideo() {
  const sel = document.getElementById('selServerVideos');
  const filename = sel?.value;
  if (!filename) {
    showAlert('กรุณาเลือกคลิปวิดีโอจากรายการบนเซิร์ฟเวอร์ก่อน', 'warning');
    return;
  }
  const btn = document.getElementById('btnApplyServerVideo');
  btn.disabled = true;
  btn.textContent = 'กำลังโหลดคลิป...';
  try {
    const res = await api.selectServerVideo(state.selectedTikTokAccount || 'default', filename);
    const selectedOpt = sel.options[sel.selectedIndex];
    const w = parseInt(selectedOpt?.dataset?.width || 720, 10);
    const h = parseInt(selectedOpt?.dataset?.height || 1280, 10);
    const isVertical = h >= w;
    setStudioOrientation(isVertical, w, h);

    // Stream video into Studio Canvas Preview
    const config = await api.getConfig();
    const videoPlayer = document.getElementById('studioVideoPlayer');
    if (videoPlayer) {
      videoPlayer.src = `${config.baseUrl}/api/v1/video/stream/${encodeURIComponent(filename)}`;
      videoPlayer.load();
      videoPlayer.play().catch(() => {});
    }

    showAlert(`เลือกคลิป ${filename} เป็นคลิปออกอากาศหลักสำเร็จ! กำลังเล่นตัวอย่างบนหน้าจอ`, 'info');
    await loadServerVideos();
  } catch (err) {
    showAlert(`เลือกคลิปล้มเหลว: ${err.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ใช้คลิปนี้';
  }
}


async function handleTikTokCookieGrab() {
  const btn = document.getElementById('btnGrabTikTokCookie');
  btn.disabled = true;
  btn.textContent = 'กำลังซิงค์...';

  try {
    await autoDetectAndSyncTikTokAccount(true);
    await syncLiveStatus();
    showAlert(`ซิงค์บัญชี TikTok (@${state.activeProfile?.uniqueId || 'ziopzz'}) สำเร็จ!`, 'info');
  } catch (err) {
    showAlert(`เกิดข้อผิดพลาดในการซิงค์บัญชี: ${err.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ซิงค์เซสชันใหม่';
  }
}

async function handleStartTikTokLive() {
  if (!state.selectedTikTokAccount) {
    showAlert('กรุณาเข้าสู่ระบบ TikTok บนเบราว์เซอร์ก่อนเริ่มไลฟ์', 'warning');
    return;
  }
  const title = document.getElementById('txtTikTokTitle').value || 'LnwLive Stream';

  const btn = document.getElementById('btnStartTikTokLive');
  btn.disabled = true;
  btn.textContent = 'กำลังเริ่มไลฟ์...';

  try {
    const res = await api.startTikTokLive({
      account_id: state.selectedTikTokAccount,
      title,
      promote_myself: true,
      show_clock: true
    });
    if (res?.room_id) {
      state.currentRoomId = res.room_id;
    }
    showAlert(`เริ่มไลฟ์ TikTok สำเร็จ! ห้อง: ${state.currentRoomId || res?.room_id || 'กำลังส่งสัญญาณ'}`, 'info');
    await syncLiveStatus();
  } catch (err) {
    showAlert(`เริ่มไลฟ์ TikTok ล้มเหลว: ${err.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${renderIcon('play')} เริ่มไลฟ์ TikTok`;
  }
}

async function handleStopTikTokLive() {
  if (!state.selectedTikTokAccount) return;
  if (!confirm('คุณต้องการหยุดการถ่ายทอดสด TikTok บัญชีนี้ใช่หรือไม่?')) return;

  const btn = document.getElementById('btnStopTikTokLive');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังหยุดไลฟ์...';
  }

  try {
    await api.stopTikTokLive(state.selectedTikTokAccount);
    showAlert('หยุดการถ่ายทอดสด TikTok และตัดสัญญาณ RTMP Ingest เรียบร้อยแล้ว', 'info');
    state.currentRoomId = '';
    await syncLiveStatus();
  } catch (err) {
    showAlert(`หยุดไลฟ์ TikTok ล้มเหลว: ${err.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${renderIcon('stop')} หยุดการไลฟ์`;
    }
  }
}

async function handleUpdateTikTokTitle() {
  const title = document.getElementById('txtTikTokTitle').value;
  if (!title) return;

  try {
    await api.updateTikTokTitle(state.selectedTikTokAccount, title);
    showAlert('อัปเดตชื่อห้องไลฟ์สดบนหน้าจอ TikTok สำเร็จทันที!', 'info');
  } catch (err) {
    showAlert(`อัปเดตชื่อล้มเหลว: ${err.message}`, 'danger');
  }
}

async function handleTikTokAgeToggle(e) {
  try {
    await api.setTikTokAgeRestriction(state.selectedTikTokAccount, e.target.checked);
    showAlert(`โหมดจำกัดอายุ 18+: ${e.target.checked ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}`, 'info');
  } catch (err) {
    showAlert(`เกิดข้อผิดพลาด: ${err.message}`, 'danger');
  }
}

async function handleTikTokPromoteToggle(e) {
  try {
    await api.setTikTokPromote(state.selectedTikTokAccount, e.target.checked, false);
    showAlert(`การโปรโมตเนื้อหาเชิงพาณิชย์: ${e.target.checked ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}`, 'info');
  } catch (err) {
    showAlert(`เกิดข้อผิดพลาด: ${err.message}`, 'danger');
  }
}

async function handleLookupTikTokProduct() {
  const urlInput = document.getElementById('txtLookupUrl');
  const url = urlInput.value.trim();
  if (!url) {
    showAlert('กรุณาวางลิงก์หรือรหัสสินค้า TikTok Shop', 'warning');
    return;
  }

  try {
    const res = await api.lookupTikTokProducts(state.selectedTikTokAccount, [url]);
    if (res.products && res.products.length > 0) {
      const prod = res.products[0];
      state.autoPinQueue.push({
        product_id: prod.product_id,
        product_name: prod.title,
        price: prod.price || '299.00',
        pin_duration_sec: parseInt(document.getElementById('numPinDuration').value, 10) || 180
      });
      renderPinQueue();
      urlInput.value = '';
      showAlert(`เพิ่มสินค้า "${prod.title}" เข้าคิวปักหมุดแล้ว!`, 'info');
    }
  } catch (err) {
    showAlert(`ค้นหาสินค้าล้มเหลว: ${err.message}`, 'danger');
  }
}

function renderPinQueue() {
  const container = document.getElementById('pinQueueContainer');
  if (!container) return;

  if (state.autoPinQueue.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 16px 0; font-size: 11px;">
        คิวว่างอยู่ กรุณาวางลิงก์หรือรหัสสินค้าด้านบนเพื่อเพิ่มสินค้าเข้าคิว
      </div>
    `;
    return;
  }

  container.innerHTML = state.autoPinQueue.map((item, idx) => {
    const isActive = state.isAutoPinRunning && (idx === state.currentPinIndex);
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; background: ${isActive ? 'rgba(0, 242, 234, 0.12)' : 'transparent'}; border-left: ${isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent'};">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); color: ${isActive ? 'var(--accent-cyan)' : 'var(--text-dim)'}; font-weight: 700;">#${idx + 1}</span>
          <div>
            <div style="font-weight: 600; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${isActive ? 'var(--text-main)' : 'var(--text-muted)'};">
              ${item.product_name}
            </div>
            <div style="font-size: 9px; color: var(--text-dim); font-family: var(--font-mono);">ID: ${item.product_id}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          ${isActive ? '<span class="badge badge-live" style="font-size: 8px; padding: 1px 4px;">กำลังปักหมุด</span>' : ''}
          <span style="color: var(--accent-cyan); font-family: var(--font-mono);">${item.pin_duration_sec}วิ</span>
          <button class="btn btn-secondary btn-sm" style="font-size: 9px; padding: 1px 5px;" onclick="window.removeQueueItem(${idx})">ลบ</button>
        </div>
      </div>
    `;
  }).join('');
}

window.removeQueueItem = (index) => {
  if (state.autoPinQueue[index]) {
    state.autoPinQueue.splice(index, 1);
    if (state.currentPinIndex >= state.autoPinQueue.length) {
      state.currentPinIndex = 0;
    }
    renderPinQueue();
  }
};

async function runAutoPinCycle() {
  if (!state.isAutoPinRunning || state.autoPinQueue.length === 0) return;

  if (state.currentPinIndex >= state.autoPinQueue.length) {
    state.currentPinIndex = 0;
  }

  const currentItem = state.autoPinQueue[state.currentPinIndex];
  renderPinQueue();

  const nameEl = document.getElementById('spPinnedItemName');
  const indexEl = document.getElementById('spPinItemIndex');
  const durationLeftEl = document.getElementById('spPinDurationLeft');

  if (nameEl) nameEl.textContent = currentItem.product_name;
  if (indexEl) indexEl.textContent = `ลำดับ: ${state.currentPinIndex + 1}/${state.autoPinQueue.length}`;

  try {
    await api.pinTikTokProduct(state.selectedTikTokAccount, currentItem.product_id);
  } catch (err) {
    console.warn('[AutoPin] Pin request error:', err);
  }

  state.remainingSeconds = currentItem.pin_duration_sec || 180;
  if (durationLeftEl) durationLeftEl.textContent = `เหลือเวลา: ${state.remainingSeconds} วินาที`;

  if (state.autoPinCountdownInterval) clearInterval(state.autoPinCountdownInterval);
  state.autoPinCountdownInterval = setInterval(async () => {
    if (!state.isAutoPinRunning) {
      clearInterval(state.autoPinCountdownInterval);
      return;
    }

    state.remainingSeconds--;
    if (durationLeftEl) durationLeftEl.textContent = `เหลือเวลา: ${Math.max(0, state.remainingSeconds)} วินาที`;

    if (state.remainingSeconds <= 0) {
      clearInterval(state.autoPinCountdownInterval);

      // Unpin current item
      try {
        await api.unpinTikTokProduct(state.selectedTikTokAccount);
      } catch (_) { }

      const unpinDelay = parseInt(document.getElementById('numUnpinDuration')?.value, 10) || 1;
      if (durationLeftEl) durationLeftEl.textContent = `เว้นช่วงสลับสินค้า (${unpinDelay}วิ)...`;

      setTimeout(() => {
        if (state.isAutoPinRunning && state.autoPinQueue.length > 0) {
          state.currentPinIndex = (state.currentPinIndex + 1) % state.autoPinQueue.length;
          runAutoPinCycle();
        }
      }, unpinDelay * 1000);
    }
  }, 1000);
}

async function handleStartAutoPin() {
  if (state.autoPinQueue.length === 0) {
    showAlert('คิวปักหมุดว่างอยู่ กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการก่อนเริ่ม', 'warning');
    return;
  }

  state.isAutoPinRunning = true;
  state.currentPinIndex = 0;

  const badge = document.getElementById('autoPinBadge');
  if (badge) {
    badge.className = 'badge badge-live';
    badge.textContent = 'กำลังวนลูปปักหมุด';
  }

  showAlert('เริ่มระบบปักหมุดสินค้าวนลูป (Auto-Pin Loop) สำเร็จ!', 'info');
  runAutoPinCycle();
}

async function handleStopAutoPin() {
  state.isAutoPinRunning = false;
  if (state.autoPinCountdownInterval) {
    clearInterval(state.autoPinCountdownInterval);
    state.autoPinCountdownInterval = null;
  }

  try {
    await api.unpinTikTokProduct(state.selectedTikTokAccount);
  } catch (_) { }

  const badge = document.getElementById('autoPinBadge');
  if (badge) {
    badge.className = 'badge badge-offline';
    badge.textContent = 'หยุดทำงาน';
  }

  const nameEl = document.getElementById('spPinnedItemName');
  const indexEl = document.getElementById('spPinItemIndex');
  const durationLeftEl = document.getElementById('spPinDurationLeft');

  if (nameEl) nameEl.textContent = 'ไม่มีสินค้าที่ปักหมุด';
  if (durationLeftEl) durationLeftEl.textContent = 'สถานะ: ปลดหมุดเรียบร้อย';
  if (indexEl) indexEl.textContent = `คิว: ${state.autoPinQueue.length} รายการ`;

  renderPinQueue();
  showAlert('หยุดระบบปักหมุดสินค้าวนลูปเรียบร้อยแล้ว', 'info');
}

async function handleSaveConfig() {
  const baseUrl = document.getElementById('cfgBaseUrl').value.trim();
  await api.setConfig({ baseUrl });
  showAlert('บันทึกการตั้งค่าเซิร์ฟเวอร์เรียบร้อยแล้ว', 'info');
}

function showAlert(message, type = 'info') {
  const alertBox = document.getElementById('spGlobalAlert');
  if (!alertBox) return;
  alertBox.innerHTML = `
    <div class="banner banner-${type}" style="margin-bottom: 10px;">
      <span>${renderIcon('alert')}</span>
      <div>${message}</div>
    </div>
  `;
  setTimeout(() => {
    alertBox.innerHTML = '';
  }, 5000);
}
