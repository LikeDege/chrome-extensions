const DEFAULT_SETTINGS = {
  maxTabs: 20,
  strategy: 'lru',       // 'lru' | 'lfu' | 'combined'
  gracePeriodMin: 5,      // newly opened tabs are protected for N minutes
  checkIntervalMin: 1,
  enabled: true,
  pinnedProtected: true,  // never close pinned tabs
  audibleProtected: true, // never close tabs playing audio
  protectedDomains: [],
};

let tabActivity = new Map();
let loadingPromise = null;
let activityLoaded = false;

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

function now() {
  return Date.now();
}

async function ensureActivityLoaded() {
  if (activityLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const result = await chrome.storage.local.get('tabActivity');
    if (result.tabActivity) {
      for (const [id, data] of result.tabActivity) {
        tabActivity.set(Number(id), data);
      }
    }
    activityLoaded = true;
  })();

  await loadingPromise;
  loadingPromise = null;
}

function recordActivity(tabId, extra = {}) {
  ensureActivityLoaded().then(() => {
    const existing = tabActivity.get(tabId) || {
      createdAt: now(),
      visitCount: 0,
    };
    tabActivity.set(tabId, {
      ...existing,
      lastAccessed: now(),
      visitCount: existing.visitCount + 1,
      ...extra,
    });
    schedulePersist();
  });
}

let persistTimer = null;

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistActivity();
  }, 1000);
}

async function persistActivity() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const entries = Array.from(tabActivity.entries());
  await chrome.storage.local.set({ tabActivity: entries });
}

function computeScore(activity, settings) {
  const age = now() - (activity.lastAccessed || activity.createdAt);
  const ageMinutes = age / 60000;

  switch (settings.strategy) {
    case 'lru':
      return ageMinutes;

    case 'lfu': {
      const freq = activity.visitCount || 1;
      return 10000 / freq;
    }

    case 'combined':
    default: {
      const freq = activity.visitCount || 1;
      const recencyWeight = 0.7;
      const frequencyWeight = 0.3;
      return recencyWeight * ageMinutes + frequencyWeight * (1000 / freq);
    }
  }
}

function isProtectedDomain(url, protectedDomains) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return protectedDomains.some(
      (d) => hostname === d || hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
}

async function evictTabs() {
  await ensureActivityLoaded();
  const settings = await getSettings();
  if (!settings.enabled) return;

  const allTabs = await chrome.tabs.query({});

  const closableTabs = [];

  for (const tab of allTabs) {
    if (tab.active) continue;
    if (settings.pinnedProtected && tab.pinned) continue;
    if (settings.audibleProtected && tab.audible) continue;
    if (isProtectedDomain(tab.url, settings.protectedDomains)) continue;

    const activity = tabActivity.get(tab.id);
    if (activity) {
      const ageMs = now() - activity.createdAt;
      if (ageMs < settings.gracePeriodMin * 60000) continue;
    }

    closableTabs.push(tab);
  }

  const totalTabs = allTabs.length;
  if (totalTabs <= settings.maxTabs) return;

  const excess = totalTabs - settings.maxTabs;

  const scored = closableTabs.map((tab) => {
    const activity = tabActivity.get(tab.id) || {
      createdAt: now(),
      lastAccessed: now() - 86400000,
      visitCount: 0,
    };
    return { tab, score: computeScore(activity, settings) };
  });

  scored.sort((a, b) => b.score - a.score);

  const toClose = scored.slice(0, excess);
  for (const { tab } of toClose) {
    try {
      await chrome.tabs.remove(tab.id);
      tabActivity.delete(tab.id);
    } catch { /* tab may already be closed */ }
  }

  if (toClose.length > 0) {
    await persistActivity();
    await updateBadge();
  }
}

async function updateBadge() {
  const settings = await getSettings();
  const allTabs = await chrome.tabs.query({});
  const count = allTabs.length;

  if (count > settings.maxTabs) {
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    await chrome.action.setBadgeText({ text: String(count) });
  } else if (count > settings.maxTabs * 0.8) {
    await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    await chrome.action.setBadgeText({ text: String(count) });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// --- Event Listeners ---

chrome.tabs.onActivated.addListener(({ tabId }) => {
  recordActivity(tabId);
  updateBadge();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    recordActivity(tabId);
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  await ensureActivityLoaded();
  tabActivity.set(tab.id, {
    createdAt: now(),
    lastAccessed: now(),
    visitCount: 1,
  });
  await persistActivity();
  await updateBadge();
  chrome.alarms.create('evict-new-tab', { delayInMinutes: 0.05 });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureActivityLoaded();
  tabActivity.delete(tabId);
  schedulePersist();
  updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'evict-check' || alarm.name === 'evict-new-tab') {
    evictTabs();
    updateBadge();
  }
});

async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear('evict-check');
  await chrome.alarms.create('evict-check', {
    periodInMinutes: settings.checkIntervalMin,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'getTabData') {
    handleGetTabData().then(sendResponse);
    return true;
  }
  if (message.type === 'settingsUpdated') {
    setupAlarm().then(() => evictTabs()).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'evictNow') {
    evictTabs().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'closeTab') {
    ensureActivityLoaded()
      .then(() => chrome.tabs.remove(message.tabId))
      .then(() => {
        tabActivity.delete(message.tabId);
        return persistActivity();
      })
      .then(() => updateBadge())
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: 'Tab not found' }));
    return true;
  }
  if (message.type === 'protectTab') {
    ensureActivityLoaded().then(() => {
      const activity = tabActivity.get(message.tabId);
      if (activity) {
        activity.visitCount = (activity.visitCount || 0) + 100;
        activity.lastAccessed = now();
        schedulePersist();
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});

async function handleGetTabData() {
  await ensureActivityLoaded();
  const settings = await getSettings();
  const allTabs = await chrome.tabs.query({});

  const tabs = allTabs.map((tab) => {
    const activity = tabActivity.get(tab.id) || {
      createdAt: now(),
      lastAccessed: now(),
      visitCount: 0,
    };

    const isProtected =
      tab.active ||
      (settings.pinnedProtected && tab.pinned) ||
      (settings.audibleProtected && tab.audible) ||
      isProtectedDomain(tab.url, settings.protectedDomains);

    const inGracePeriod = now() - activity.createdAt < settings.gracePeriodMin * 60000;

    return {
      id: tab.id,
      title: tab.title || 'Untitled',
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      pinned: tab.pinned,
      audible: tab.audible,
      active: tab.active,
      lastAccessed: activity.lastAccessed,
      visitCount: activity.visitCount,
      score: computeScore(activity, settings),
      protected: isProtected,
      inGracePeriod,
    };
  });

  tabs.sort((a, b) => b.score - a.score);

  return { tabs, settings, totalTabs: allTabs.length };
}

// --- Init ---

async function cleanupStaleEntries() {
  const allTabs = await chrome.tabs.query({});
  const liveIds = new Set(allTabs.map((t) => t.id));

  for (const id of tabActivity.keys()) {
    if (!liveIds.has(id)) tabActivity.delete(id);
  }

  for (const tab of allTabs) {
    if (!tabActivity.has(tab.id)) {
      tabActivity.set(tab.id, {
        createdAt: now() - 600000,
        lastAccessed: now() - 600000,
        visitCount: 1,
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureActivityLoaded();
  await cleanupStaleEntries();
  await persistActivity();
  await setupAlarm();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureActivityLoaded();
  await cleanupStaleEntries();
  await persistActivity();
  await setupAlarm();
  await updateBadge();
});
