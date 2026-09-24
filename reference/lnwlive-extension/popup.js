import { api } from './js/api.js';
import { CookieManager } from './js/cookie-manager.js';
import { renderIcon } from './assets/icons.js';

document.addEventListener('DOMContentLoaded', async () => {
  setupIcons();
  setupEventListeners();
  await loadState();
  await detectActiveTab();
});

function setupIcons() {
  document.getElementById('btnOpenDashboard').innerHTML = renderIcon('monitor');
  document.getElementById('btnOpenSidePanel').innerHTML = renderIcon('panel');
  document.getElementById('btnRefreshStats').innerHTML = renderIcon('refresh');
  document.getElementById('tabSyncIcon').innerHTML = renderIcon('search');
  document.getElementById('iconLaunchSidePanel').innerHTML = renderIcon('panel');
  document.getElementById('iconLaunchDashboard').innerHTML = renderIcon('monitor');
}

function setupEventListeners() {
  document.getElementById('btnRefreshStats').addEventListener('click', loadState);
  document.getElementById('btnLaunchSidePanel').addEventListener('click', openSidePanel);
  document.getElementById('btnOpenSidePanel').addEventListener('click', openSidePanel);
  document.getElementById('btnLaunchFullDashboard').addEventListener('click', openDashboard);
  document.getElementById('btnOpenDashboard').addEventListener('click', openDashboard);
  document.getElementById('btnQuickSync').addEventListener('click', handleQuickSync);
}

async function openSidePanel() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0] && chrome.sidePanel?.open) {
        try {
          await chrome.sidePanel.open({ tabId: tabs[0].id });
          window.close();
        } catch (e) {
          openDashboard();
        }
      } else {
        openDashboard();
      }
    });
  } else {
    openDashboard();
  }
}

function openDashboard() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  } else {
    window.open('dashboard.html', '_blank');
  }
  if (typeof window.close === 'function') window.close();
}

async function loadState() {
  const listEl = document.getElementById('activeStreamsList');
  const statusEl = document.getElementById('valTikTokStatus');
  try {
    const res = await api.getTikTokLiveStatus();
    const isLive = !!(res && (res.is_live || (Array.isArray(res.sessions) && res.sessions.length > 0)));
    const ttList = Array.isArray(res?.sessions) ? res.sessions : [];

    if (statusEl) {
      statusEl.textContent = isLive ? 'กำลังไลฟ์สด' : 'พร้อมทำงาน';
      statusEl.className = isLive ? 'stat-value live' : 'stat-value emerald';
    }

    if (!isLive || ttList.length === 0) {
      listEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
          <span style="color: var(--text-main); font-weight: 600;">enemy's nightmare (@ziopzz)</span>
          <span class="badge badge-offline">ออฟไลน์ (พร้อมเริ่มไลฟ์)</span>
        </div>
      `;
    } else {
      listEl.innerHTML = ttList.map(t => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${renderIcon('tiktok')}
            <span style="font-weight: 600; font-size: 12px; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${t.title || t.accountName || 'TikTok Live Room'}
            </span>
          </div>
          <span class="badge badge-live">กำลังไลฟ์สด</span>
        </div>
      `).join('');
    }
  } catch (err) {
    listEl.innerHTML = `<div style="color: var(--accent-cyan); font-size: 11px;">ระบบทำงานออนไลน์พร้อมรับสัญญาณ (Keyless Mode)</div>`;
  }
}

async function detectActiveTab() {
  const tabInfo = await CookieManager.getActiveTabPlatform();
  const iconEl = document.getElementById('tabSyncIcon');
  const textEl = document.getElementById('tabSyncText');
  const btnEl = document.getElementById('btnQuickSync');

  if (tabInfo.platform === 'tiktok') {
    iconEl.innerHTML = renderIcon('tiktok');
    textEl.textContent = 'ตรวจพบแท็บ TikTok Live';
    btnEl.textContent = 'ซิงค์ TikTok';
    btnEl.disabled = false;
  } else {
    iconEl.innerHTML = renderIcon('tiktok');
    textEl.textContent = 'กรุณาเปิดแท็บ TikTok.com';
    btnEl.textContent = 'ดึง Cookie TikTok';
  }
}

async function handleQuickSync() {
  const btn = document.getElementById('btnQuickSync');
  btn.disabled = true;
  btn.textContent = 'กำลังซิงค์...';

  try {
    const cookies = await CookieManager.extractTikTokCookies();
    if (!cookies.success) {
      alert('คำเตือน: ไม่พบ sessionid กรุณาเข้าสู่ระบบ TikTok ในเบราว์เซอร์ก่อน');
    } else {
      await api.addTikTokAccount(cookies.cookie, 'TikTok Shop ซิงค์อัตโนมัติ');
      alert('ดึงเซสชัน Cookie TikTok เข้าฐานข้อมูล SQLite เซิร์ฟเวอร์สำเร็จเรียบร้อยแล้ว!');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการซิงค์: ' + err.message);
  } finally {
    btn.disabled = false;
    await detectActiveTab();
  }
}
