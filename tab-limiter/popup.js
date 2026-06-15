const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DEFAULT_SETTINGS = {
  maxTabs: 20,
  strategy: 'lru',
  gracePeriodMin: 5,
  checkIntervalMin: 1,
  enabled: true,
  pinnedProtected: true,
  audibleProtected: true,
  protectedDomains: [],
};

// --- Tab Bar ---

$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// --- Load Settings ---

async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  const settings = { ...DEFAULT_SETTINGS, ...result.settings };

  $('#toggle-enabled').checked = settings.enabled;
  $('#max-tabs').value = settings.maxTabs;
  $('#max-tabs-value').textContent = settings.maxTabs;
  $('#strategy').value = settings.strategy;
  $('#grace-period').value = settings.gracePeriodMin;
  $('#grace-period-value').textContent = settings.gracePeriodMin;
  $('#check-interval').value = settings.checkIntervalMin;
  $('#check-interval-value').textContent = settings.checkIntervalMin;
  $('#pinned-protected').checked = settings.pinnedProtected;
  $('#audible-protected').checked = settings.audibleProtected;
  $('#protected-domains').value = settings.protectedDomains.join('\n');

  return settings;
}

async function saveSettings() {
  const settings = {
    enabled: $('#toggle-enabled').checked,
    maxTabs: parseInt($('#max-tabs').value, 10),
    strategy: $('#strategy').value,
    gracePeriodMin: parseInt($('#grace-period').value, 10),
    checkIntervalMin: parseInt($('#check-interval').value, 10),
    pinnedProtected: $('#pinned-protected').checked,
    audibleProtected: $('#audible-protected').checked,
    protectedDomains: $('#protected-domains').value
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean),
  };

  await chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: 'settingsUpdated' }).catch(() => {});
}

// --- Settings Event Listeners ---

let rangeSaveTimeout;

function bindRangeInput(rangeId, valueId) {
  $(rangeId).addEventListener('input', () => {
    $(valueId).textContent = $(rangeId).value;
    clearTimeout(rangeSaveTimeout);
    rangeSaveTimeout = setTimeout(saveSettings, 300);
  });
}

bindRangeInput('#max-tabs', '#max-tabs-value');
bindRangeInput('#grace-period', '#grace-period-value');
bindRangeInput('#check-interval', '#check-interval-value');

['#toggle-enabled', '#strategy', '#pinned-protected', '#audible-protected'].forEach(
  (sel) => {
    $(sel).addEventListener('change', saveSettings);
  }
);

let domainSaveTimeout;
$('#protected-domains').addEventListener('input', () => {
  clearTimeout(domainSaveTimeout);
  domainSaveTimeout = setTimeout(saveSettings, 500);
});

// --- Tab List ---

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function createTabElement(tab, settings) {
  const el = document.createElement('div');
  el.className = 'tab-item';

  if (tab.protected) el.classList.add('protected');
  else if (tab.inGracePeriod) el.classList.add('grace');
  else if (tab.rank <= 3) el.classList.add('danger');

  const favicon = document.createElement('img');
  favicon.className = 'tab-favicon';
  favicon.alt = '';
  favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23ddd" width="16" height="16" rx="2"/></svg>';
  favicon.addEventListener('error', () => { favicon.style.visibility = 'hidden'; });

  const info = document.createElement('div');
  info.className = 'tab-info';
  info.innerHTML = `
    <div class="tab-title" title="${escapeAttr(tab.title)}">${escapeHtml(tab.title)}</div>
    <div class="tab-meta">
      <span>${timeAgo(tab.lastAccessed)}</span>
      <span>${tab.visitCount}次访问</span>
      ${tab.pinned ? '<span>📌</span>' : ''}
      ${tab.audible ? '<span>🔊</span>' : ''}
      ${tab.active ? '<span>✦ 活跃</span>' : ''}
      ${tab.inGracePeriod ? '<span>🛡 保护中</span>' : ''}
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'tab-actions';
  actions.innerHTML = `
    ${!tab.protected ? `<button class="tab-action-btn" data-action="protect" data-id="${tab.id}" title="提升优先级">↑</button>` : ''}
    ${!tab.active ? `<button class="tab-action-btn close" data-action="close" data-id="${tab.id}" title="关闭">✕</button>` : ''}
  `;

  el.appendChild(favicon);
  el.appendChild(info);
  el.appendChild(actions);

  return el;
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function refreshTabList() {
  const data = await chrome.runtime.sendMessage({ type: 'getTabData' });
  if (!data) return;

  const { tabs, settings, totalTabs } = data;

  // Update badge
  const badge = $('#tab-count');
  badge.textContent = `${totalTabs} / ${settings.maxTabs}`;
  badge.className = 'badge';
  if (totalTabs > settings.maxTabs) badge.classList.add('over');
  else if (totalTabs > settings.maxTabs * 0.8) badge.classList.add('warning');

  // Status text
  const excess = Math.max(0, totalTabs - settings.maxTabs);
  $('#status-text').textContent = excess > 0
    ? `超出 ${excess} 个标签页`
    : `还可打开 ${settings.maxTabs - totalTabs} 个`;

  // Render tab list
  const list = $('#tab-list');
  list.innerHTML = '';

  if (tabs.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon">🎉</div><div>没有打开的标签页</div></div>';
    return;
  }

  const nonProtected = tabs.filter((t) => !t.protected && !t.inGracePeriod);
  for (let i = 0; i < nonProtected.length; i++) {
    nonProtected[i].rank = i + 1;
  }

  for (const tab of tabs) {
    list.appendChild(createTabElement(tab, settings));
  }
}

// --- Tab Actions ---

$('#tab-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const tabId = parseInt(btn.dataset.id, 10);
  const action = btn.dataset.action;

  if (action === 'close') {
    await chrome.runtime.sendMessage({ type: 'closeTab', tabId });
    refreshTabList();
  } else if (action === 'protect') {
    await chrome.runtime.sendMessage({ type: 'protectTab', tabId });
    refreshTabList();
  }
});

$('#btn-evict').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'evictNow' });
  refreshTabList();
});

// --- Init ---

loadSettings().then(() => refreshTabList());
