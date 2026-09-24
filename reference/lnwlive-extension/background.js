/**
 * LnwLiveSHTIK - Background Service Worker (Manifest V3)
 * 100% TikTok Live Command System Engine
 */

import { ApiClient } from './js/api.js';

const api = new ApiClient();

chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn('Sidepanel behavior note:', err));

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LNWCODE HACKER] LnwLiveSHTIK TikTok Live Engine v4.0 installed.');
  chrome.storage.local.set({
    'livestream_config': { baseUrl: 'http://102.129.229.177:8000' }
  });
  chrome.alarms.create('tiktok_live_health_check', { periodInMinutes: 1 });
  updateBadgeState();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    'livestream_config': { baseUrl: 'http://102.129.229.177:8000' }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tiktok_live_health_check') {
    updateBadgeState();
  }
});

async function updateBadgeState() {
  try {
    const tiktokLive = await api.getTikTokLiveStatus().catch(() => null);
    let isLive = !!(tiktokLive && (tiktokLive.is_live || (Array.isArray(tiktokLive.sessions) && tiktokLive.sessions.length > 0)));

    if (isLive) {
      chrome.action.setBadgeText({ text: 'LIVE' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); // Live Red
    } else {
      chrome.action.setBadgeText({ text: 'v4.0' });
      chrome.action.setBadgeBackgroundColor({ color: '#06b6d4' }); // Cyan Active
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: 'v4.0' });
    chrome.action.setBadgeBackgroundColor({ color: '#06b6d4' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REFRESH_BADGE') {
    updateBadgeState().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id })
          .then(() => sendResponse({ success: true }))
          .catch((e) => sendResponse({ success: false, error: e.message }));
      }
    });
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    sendResponse({ success: true });
    return true;
  }
});
