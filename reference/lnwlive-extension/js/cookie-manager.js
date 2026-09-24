/**
 * LnwLiveSHTIK - Cookie Extraction Engine
 * Extracts and formats authentication cookies for TikTok Live & TikTok Shop
 */

export class CookieManager {
  /**
   * Extract all cookies for a domain and format as a valid cookie header string
   */
  static async getDomainCookies(domain) {
    return new Promise((resolve, reject) => {
      if (!chrome.cookies) {
        return reject(new Error('chrome.cookies API is unavailable. Ensure permissions are set.'));
      }

      chrome.cookies.getAll({ domain }, (cookies) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }

        if (!cookies || cookies.length === 0) {
          const dotDomain = domain.startsWith('.') ? domain.substring(1) : `.${domain}`;
          chrome.cookies.getAll({ domain: dotDomain }, (fallbackCookies) => {
            const list = fallbackCookies || [];
            resolve(CookieManager.formatCookies(list));
          });
          return;
        }

        resolve(CookieManager.formatCookies(cookies));
      });
    });
  }

  /**
   * Convert Chrome Cookie objects into string: "name1=value1; name2=value2;"
   */
  static formatCookies(cookies) {
    if (!cookies || !cookies.length) return '';
    const map = new Map();
    for (const c of cookies) {
      map.set(c.name, c.value);
    }
    const pairs = [];
    for (const [name, val] of map.entries()) {
      pairs.push(`${name}=${val}`);
    }
    return pairs.join('; ');
  }

  /**
   * One-click extract TikTok Shop / TikTok Live cookies
   * Key tokens: sessionid, sid_tt, passport_csrf_token, multi_sids, s_v_web_id, living_user_id
   */
  static async extractTikTokCookies() {
    const raw = await CookieManager.getDomainCookies('tiktok.com');
    const hasSessionId = raw.includes('sessionid=');
    const hasSidTt = raw.includes('sid_tt=');
    const hasCsrf = raw.includes('passport_csrf_token=');

    // Dynamically extract user ID from cookie tokens
    const matchUid = raw.match(/living_user_id=(\d+)/) || raw.match(/uid_tt_ss=([a-f0-9]+)/) || raw.match(/odin_tt=([a-f0-9]{12,})/);
    const userId = matchUid ? matchUid[1] : '';

    return {
      success: hasSessionId || hasSidTt,
      cookie: raw,
      userId,
      hasSessionId,
      hasSidTt,
      hasCsrf,
      summary: (hasSessionId || hasSidTt)
        ? `TikTok Session Detected (${userId ? 'User ID: ' + userId : 'Session active'})`
        : 'Warning: sessionid not found. Make sure you are logged in to TikTok.'
    };
  }

  /**
   * Dynamically fetch TikTok Profile details (Nickname, Handle @username, ID, Avatar)
   * 1. Direct call to TikTok self profile API
   * 2. Active Tab DOM & Title Inspection fallback
   */
  static async fetchTikTokProfile(cookieStr = '') {
    let nickname = '';
    let uniqueId = '';
    let userId = '';
    let avatar = '';

    // 1. Try Direct TikTok Self API
    try {
      const resp = await fetch('https://www.tiktok.com/api/user/detail/self/?aid=1988', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        const u = data?.userInfo?.user;
        if (u) {
          nickname = u.nickname || '';
          uniqueId = u.uniqueId || '';
          userId = String(u.id || '');
          avatar = u.avatarThumb || '';
        }
      }
    } catch (err) {
      console.warn('[CookieManager] TikTok API Profile Fetch Warning:', err);
    }

    // 2. Active Tab DOM & Metadata Inspection Fallback
    if (!nickname && !uniqueId) {
      try {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        const tab = tabs && tabs[0];
        if (tab && tab.url && tab.url.includes('tiktok.com')) {
          // Parse handle from URL: tiktok.com/@username
          const matchHandle = tab.url.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
          if (matchHandle) {
            uniqueId = matchHandle[1];
          }

          // Parse name from Tab Title
          if (tab.title) {
            const cleanTitle = tab.title.replace(/\s*\|\s*TikTok$/i, '').trim();
            if (cleanTitle) {
              const parts = cleanTitle.split('|');
              nickname = parts[0].trim();
              if (parts[1] && !uniqueId) {
                uniqueId = parts[1].trim();
              }
            }
          }

          // Query injected content script directly
          if (tab.id && (!nickname || !uniqueId)) {
            try {
              const csRes = await new Promise((res) => {
                chrome.tabs.sendMessage(tab.id, { action: 'GET_TIKTOK_PROFILE' }, (r) => {
                  if (chrome.runtime.lastError) return res(null);
                  res(r);
                });
              });
              if (csRes) {
                if (csRes.nickname) nickname = csRes.nickname;
                if (csRes.uniqueId) uniqueId = csRes.uniqueId;
              }
            } catch (_) {}
          }

          // DOM script execution if scripting permission is available
          if (chrome.scripting && tab.id && (!nickname || !uniqueId)) {
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  const titleEl = document.querySelector('[data-e2e="user-title"]');
                  const subtitleEl = document.querySelector('[data-e2e="user-subtitle"]');
                  return {
                    title: titleEl ? titleEl.innerText.trim() : '',
                    subtitle: subtitleEl ? subtitleEl.innerText.trim() : ''
                  };
                }
              });
              if (results && results[0]?.result) {
                if (results[0].result.title) nickname = results[0].result.title;
                if (results[0].result.subtitle) uniqueId = results[0].result.subtitle.replace(/^@/, '');
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('[CookieManager] Tab inspection fallback error:', err);
      }
    }

    // Format final display name
    let displayName = '';
    if (nickname && uniqueId) {
      displayName = `${nickname} (@${uniqueId})`;
    } else if (nickname) {
      displayName = nickname;
    } else if (uniqueId) {
      displayName = `@${uniqueId}`;
    }

    return {
      nickname,
      uniqueId,
      userId,
      avatar,
      displayName
    };
  }

  /**
   * Detect current active tab platform
   */
  static async getActiveTabPlatform() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
          return resolve({ platform: 'unknown', url: '' });
        }
        const url = tabs[0].url;
        if (url.includes('tiktok.com')) {
          return resolve({ platform: 'tiktok', url, title: tabs[0].title });
        }
        resolve({ platform: 'other', url, title: tabs[0].title });
      });
    });
  }
}

