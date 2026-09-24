/**
 * LnwLiveSHTIK - Dashboard Controller
 * ศูนย์บัญชาการการถ่ายทอดสดหลายหน้าจอ (100% TikTok Live & Shop Engine)
 */

import { api } from './js/api.js';
import { renderIcon } from './assets/icons.js';

const optimisticLiveStates = new Map(); // account_id -> { isLive: boolean, expiresAt: number }

document.addEventListener('DOMContentLoaded', async () => {
  setupIcons();
  setupEventListeners();
  await refreshDashboard();

  // Poll matrix every 5 seconds
  setInterval(refreshDashboard, 5000);
});

function setupIcons() {
  const logoEl = document.getElementById('dashLogo');
  if (logoEl) logoEl.innerHTML = renderIcon('brand');
  
  const refEl = document.getElementById('iconDashRefresh');
  if (refEl) refEl.innerHTML = renderIcon('refresh');

  const dockEl = document.getElementById('iconDashDock');
  if (dockEl) dockEl.innerHTML = renderIcon('panel');

  const matEl = document.getElementById('iconMatrix');
  if (matEl) matEl.innerHTML = renderIcon('monitor');
}

function setupEventListeners() {
  const btnRefresh = document.getElementById('btnDashRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      try {
        await refreshDashboard();
      } finally {
        btnRefresh.disabled = false;
      }
    });
  }

  const btnOpenSP = document.getElementById('btnOpenSidePanelFromDash');
  if (btnOpenSP) {
    btnOpenSP.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.sidePanel?.open) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) chrome.sidePanel.open({ tabId: tabs[0].id });
        });
      } else {
        window.open('sidepanel.html', '_blank', 'width=420,height=750');
      }
    });
  }

  // Custom Video & Scheduler
  const btnSelectLocal = document.getElementById('btnSelectLocalVideo');
  if (btnSelectLocal) {
    btnSelectLocal.addEventListener('click', () => {
      document.getElementById('localVideoFileSelect')?.click();
    });
  }

  const fileSelect = document.getElementById('localVideoFileSelect');
  if (fileSelect) {
    fileSelect.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const inputUrl = document.getElementById('customVideoUrl');
        if (inputUrl) inputUrl.value = file.name;
      }
    });
  }

  const btnSaveSched = document.getElementById('btnSaveLiveSchedule');
  if (btnSaveSched) {
    btnSaveSched.addEventListener('click', handleSaveLiveSchedule);
  }

  const btnPin = document.getElementById('btnPinProductAction');
  if (btnPin) btnPin.addEventListener('click', handlePinProductAction);

  const btnUnpin = document.getElementById('btnUnpinProductAction');
  if (btnUnpin) btnUnpin.addEventListener('click', handleUnpinProductAction);

  // Poll Live Chat Comments
  setInterval(pollLiveChatComments, 4000);
}

let activeDashboardAccount = null;

async function handleSaveLiveSchedule() {
  const videoUrl = document.getElementById('customVideoUrl')?.value.trim();
  const dateVal = document.getElementById('scheduleDate')?.value;
  const timeVal = document.getElementById('scheduleTime')?.value;

  if (!activeDashboardAccount) {
    alert('ไม่พบบัญชี TikTok ที่พร้อมใช้งาน กรุณาผูกบัญชีก่อนตั้งเวลา');
    return;
  }

  if (!videoUrl || !dateVal || !timeVal) {
    alert('กรุณาเลือกไฟล์วิดีโอ/ใส่ URL และเลือกวันที่และเวลาออกอากาศ');
    return;
  }

  const scheduledTime = `${dateVal} ${timeVal}`;
  try {
    await api.scheduleTikTokStream({
      account_id: activeDashboardAccount.id,
      title: 'LnwLive Scheduled Stream',
      video_url: videoUrl,
      scheduled_time: scheduledTime
    });
    alert(`บันทึกตารางออกอากาศสำเร็จ! กำหนดออกอากาศเวลา: ${scheduledTime}`);
  } catch (err) {
    alert('บันทึกตารางล้มเหลว: ' + err.message);
  }
}

async function handlePinProductAction() {
  const productId = document.getElementById('pinProductId')?.value.trim();
  if (!activeDashboardAccount) {
    alert('ไม่พบบัญชี TikTok ที่พร้อมใช้งาน');
    return;
  }
  if (!productId) {
    alert('กรุณากรอก Product ID ที่ต้องการปักหมุด');
    return;
  }
  try {
    await api.pinTikTokProduct(activeDashboardAccount.id, productId);
    alert(`ปักหมุดสินค้า Product ID: ${productId} เรียบร้อยแล้ว!`);
  } catch (err) {
    alert('ปักหมุดสินค้าล้มเหลว: ' + err.message);
  }
}

async function handleUnpinProductAction() {
  if (!activeDashboardAccount) return;
  try {
    await api.unpinTikTokProduct(activeDashboardAccount.id);
    alert('ปลดปักหมุดสินค้าออกจากหน้าจอเรียบร้อยแล้ว!');
  } catch (err) {
    alert('ปลดปักหมุดล้มเหลว: ' + err.message);
  }
}

async function pollLiveChatComments() {
  const box = document.getElementById('liveChatMonitorBox');
  if (!box) return;

  try {
    const res = await api.getTikTokLiveComments(null, activeDashboardAccount?.id);
    if (res.comments && res.comments.length > 0) {
      box.innerHTML = res.comments.map(c => `
        <div style="margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <strong style="color: var(--accent-cyan);">${c.user || 'ผู้ชม'}:</strong>
          <span style="color: var(--text-main); margin-left: 4px;">${c.comment}</span>
        </div>
      `).join('');
    }
  } catch (_) {}
}

async function refreshDashboard() {
  const now = Date.now();
  for (const [id, item] of optimisticLiveStates.entries()) {
    if (now > item.expiresAt) optimisticLiveStates.delete(id);
  }

  try {
    const [screensRes, tiktokAccRes, tiktokLiveRes] = await Promise.allSettled([
      api.getScreens(),
      api.getTikTokAccounts(),
      api.getTikTokLiveStatus()
    ]);

    if (screensRes.status === 'fulfilled' && screensRes.value?.data) {
      const d = screensRes.value.data;
      const qEl = document.getElementById('dashTikTokQuota');
      if (qEl) qEl.textContent = `${d.tiktokActiveScreens || 1} จอ`;
    }

    let totalStreams = 0;
    let totalGmv = 0;
    const cards = [];

    if (tiktokAccRes.status === 'fulfilled' && Array.isArray(tiktokAccRes.value?.data) && tiktokAccRes.value.data.length > 0) {
      const seen = new Set();
      const ttAccounts = [];
      tiktokAccRes.value.data.forEach(acc => {
        const name = (acc.accountName || acc.displayName || acc.username || '').trim();
        const matchHandle = name.match(/@([a-zA-Z0-9_.-]+)/);
        const key = matchHandle ? matchHandle[1].toLowerCase() : (name.toLowerCase() || acc.id);
        if (!seen.has(key)) {
          seen.add(key);
          ttAccounts.push(acc);
        }
      });

      activeDashboardAccount = ttAccounts[0];
      const ttLiveVal = (tiktokLiveRes.status === 'fulfilled') ? tiktokLiveRes.value : null;
      const ttLiveSessions = Array.isArray(ttLiveVal?.sessions) ? ttLiveVal.sessions : (Array.isArray(ttLiveVal?.data) ? ttLiveVal.data : []);

      ttAccounts.forEach(acc => {
        const liveInfo = ttLiveSessions.find(l => l.id === acc.id || l.account_id === acc.id || l.accountId === acc.id);
        let isLive = liveInfo ? !!liveInfo.is_live : false;
        if (optimisticLiveStates.has(acc.id)) {
          isLive = optimisticLiveStates.get(acc.id).isLive;
        }

        if (isLive) totalStreams++;

        cards.push({
          platform: 'TikTok',
          id: acc.id,
          name: acc.accountName || acc.displayName || acc.username || `TikTok Live (${acc.id})`,
          title: acc.title || liveInfo?.title || 'LnwLive Dynamic Stream',
          isLive,
          viewers: isLive ? (typeof liveInfo?.viewer_count === 'number' ? liveInfo.viewer_count : 0) : 0,
          gmv: '0.00',
          orders: 12
        });
      });
    }

    if (cards.length === 0) {
      cards.push({
        platform: 'TikTok',
        id: 'ไม่พบบัญชี',
        name: 'ยังไม่มีบัญชีในระบบ',
        title: 'กรุณากดเปิดแถบด้านข้าง (Side Panel) เพื่อดึง Cookie',
        isLive: false,
        viewers: 0,
        gmv: '0.00',
        orders: 0
      });
    }

    const liveEl = document.getElementById('dashTotalLive');
    if (liveEl) liveEl.textContent = `${totalStreams} สตรีม`;

    const gmvEl = document.getElementById('dashTotalGmv');
    if (gmvEl) gmvEl.textContent = `฿${totalGmv.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    renderMatrixGrid(cards);
  } catch (err) {
    console.error('รีเฟรชแดชบอร์ดล้มเหลว:', err);
  }
}

function renderMatrixGrid(cards) {
  const container = document.getElementById('streamMatrixGrid');
  if (!container) return;

  container.innerHTML = cards.map(c => `
    <div class="stream-card live-border tiktok-accent">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderIcon('tiktok')}
          <div>
            <strong style="font-size: 13px; color: var(--text-main);">${c.name}</strong>
            <span style="display: block; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">${c.id}</span>
          </div>
        </div>
        <span class="badge badge-live">กำลังไลฟ์สด</span>
      </div>

      <div style="font-size: 12px; margin-bottom: 12px; color: var(--text-muted); font-weight: 500;">
        ${c.title}
      </div>

      <div class="grid-3" style="margin-bottom: 12px;">
        <div class="stat-box" style="padding: 6px 8px;">
          <div class="stat-label" style="font-size: 9px;">ผู้ชมสด</div>
          <div class="stat-value live" style="font-size: 14px;">${c.viewers}</div>
        </div>
        <div class="stat-box" style="padding: 6px 8px;">
          <div class="stat-label" style="font-size: 9px;">ออเดอร์</div>
          <div class="stat-value accent" style="font-size: 14px;">${c.orders}</div>
        </div>
        <div class="stat-box" style="padding: 6px 8px;">
          <div class="stat-label" style="font-size: 9px;">ยอดขาย</div>
          <div class="stat-value emerald" style="font-size: 13px;">฿${parseFloat(c.gmv).toFixed(0)}</div>
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        ${c.isLive ? `
          <button class="btn btn-danger btn-sm" style="flex: 1;" onclick="window.dashStopLive('${c.id}', this)">
            ${renderIcon('stop')} หยุดการไลฟ์
          </button>
        ` : `
          <button class="btn btn-success btn-sm" style="flex: 1;" onclick="window.dashStartLive('${c.id}', this)">
            ${renderIcon('play')} เริ่มไลฟ์ TikTok
          </button>
        `}
      </div>
    </div>
  `).join('');
}

window.dashStartLive = async (id, btnEl) => {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'กำลังเริ่มไลฟ์...';
  }

  optimisticLiveStates.set(id, { isLive: true, expiresAt: Date.now() + 6000 });
  await refreshDashboard();

  try {
    await api.startTikTokLive({
      account_id: id,
      title: 'LnwLive 24/7 Premium Sale Stream',
      promote_myself: true,
      show_clock: true
    });
    await refreshDashboard();
  } catch (err) {
    optimisticLiveStates.delete(id);
    alert(`เริ่มไลฟ์ล้มเหลว: ${err.message}`);
    await refreshDashboard();
  }
};

window.dashStopLive = async (id, btnEl) => {
  if (!confirm(`คุณต้องการหยุดการถ่ายทอดสด TikTok บัญชีนี้ใช่หรือไม่?`)) return;

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'กำลังหยุดไลฟ์...';
  }

  optimisticLiveStates.set(id, { isLive: false, expiresAt: Date.now() + 6000 });
  await refreshDashboard();

  try {
    await api.stopTikTokLive(id);
    await refreshDashboard();
  } catch (err) {
    optimisticLiveStates.delete(id);
    alert(`หยุดไลฟ์ล้มเหลว: ${err.message}`);
    await refreshDashboard();
  }
};
