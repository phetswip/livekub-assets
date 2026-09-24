/**
 * LnwLiveSHTIK - Content Script
 * Enhances TikTok Live & TikTok Shop Seller Center pages
 */

console.log('[LNWCODE HACKER] LnwLiveSHTIK Content Script injected.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING_PAGE') {
    sendResponse({
      status: 'active',
      url: window.location.href,
      title: document.title
    });
    return true;
  }

  if (request.action === 'GET_TIKTOK_PROFILE') {
    const titleEl = document.querySelector('[data-e2e="user-title"]');
    const subtitleEl = document.querySelector('[data-e2e="user-subtitle"]');
    const matchHandle = window.location.pathname.match(/@([a-zA-Z0-9_.-]+)/);
    sendResponse({
      nickname: titleEl ? titleEl.innerText.trim() : '',
      uniqueId: subtitleEl ? subtitleEl.innerText.trim().replace(/^@/, '') : (matchHandle ? matchHandle[1] : '')
    });
    return true;
  }

  if (request.action === 'GET_LIVE_VIEWERS') {
    let count = -1;
    // Look for text matching "ผู้ชม · X" or "Audience · X" or similar
    const bodyText = document.body ? document.body.innerText : '';
    const match = bodyText.match(/(?:ผู้ชม|Audience|Viewers?)\s*[·•:]\s*([\d,]+)/i);
    if (match) {
      count = parseInt(match[1].replace(/,/g, ''), 10);
    } else {
      const viewerEl = document.querySelector('[data-e2e="live-audience-count"], [data-e2e="live-room-user-count"], [data-e2e="audience-count"]');
      if (viewerEl) {
        const num = parseInt(viewerEl.innerText.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num)) count = num;
      }
    }
    sendResponse({ count });
    return true;
  }
});

